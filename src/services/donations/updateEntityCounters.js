const { checkContext } = require('feathers-hooks-common');
const { toBN } = require('web3-utils');
const logger = require('winston');

const _groupBy = require('lodash.groupby');
const { AdminTypes } = require('../../models/pledgeAdmins.model');
const { DonationStatus } = require('../../models/donations.model');
const { MilestoneTypes } = require('../../models/milestones.model');
const { ANY_TOKEN } = require('../../blockchain/lib/web3Helpers');
const { donationsCollected } = require('../../utils/dappMailer');
const { EventStatus } = require('../../models/events.model');

const ENTITY_SERVICES = {
  [AdminTypes.DAC]: 'dacs',
  [AdminTypes.CAMPAIGN]: 'campaigns',
  [AdminTypes.MILESTONE]: 'milestones',
};

const updateEntity = async (app, id, type) => {
  const serviceName = ENTITY_SERVICES[type];
  const donationQuery = {
    $select: ['amount', 'giverAddress', 'amountRemaining', 'token', 'status', 'isReturn'],
    mined: true,
    status: { $nin: [DonationStatus.FAILED] },
  };

  if (type === AdminTypes.DAC) {
    // TODO I think this can be gamed if the donor refunds their donation from the dac
    Object.assign(donationQuery, {
      delegateTypeId: id,
      delegateType: AdminTypes.DAC,
      $and: [
        {
          $or: [{ intendedProjectId: 0 }, { intendedProjectId: undefined }],
        },
        {
          $or: [{ parentDonations: { $not: { $size: 0 } } }, { amountRemaining: { $ne: '0' } }],
        },
      ],
    });
  } else if (type === AdminTypes.CAMPAIGN) {
    Object.assign(donationQuery, {
      ownerTypeId: id,
      ownerType: AdminTypes.CAMPAIGN,
    });
  } else if (type === AdminTypes.MILESTONE) {
    Object.assign(donationQuery, {
      ownerTypeId: id,
      ownerType: AdminTypes.MILESTONE,
    });
  } else {
    return;
  }

  const service = app.service(serviceName);
  try {
    const entity = await service.get(id);

    const donations = await app
      .service('donations')
      .find({ paginate: false, query: donationQuery });

    const returnedDonations = await app.service('donations').find({
      paginate: false,
      query: {
        $select: ['amount', 'token', 'status'],
        isReturn: true,
        mined: true,
        parentDonations: { $in: donations.map(d => d._id) },
      },
    });

    // first group by token (symbol)
    const groupedDonations = _groupBy(donations, d => (d.token && d.token.symbol) || 'ETH');
    const groupedReturnedDonations = _groupBy(
      returnedDonations,
      d => (d.token && d.token.symbol) || 'ETH',
    );

    // and calculate cumulative token balances for each donated token
    const donationCounters = Object.keys(groupedDonations).map(symbol => {
      const tokenDonations = groupedDonations[symbol];
      const returnedTokenDonations = groupedReturnedDonations[symbol] || [];

      // eslint-disable-next-line prefer-const
      let { totalDonated, currentBalance } = tokenDonations
        .filter(
          d =>
            (type === AdminTypes.MILESTONE && entity.type === MilestoneTypes.LPMilestone) ||
            ![DonationStatus.PAYING, DonationStatus.PAID].includes(d.status),
        )
        .reduce(
          (accumulator, d) => ({
            totalDonated: d.isReturn
              ? accumulator.totalDonated
              : accumulator.totalDonated.add(toBN(d.amount)),
            currentBalance: accumulator.currentBalance.add(toBN(d.amountRemaining)),
          }),
          {
            totalDonated: toBN(0),
            currentBalance: toBN(0),
          },
        );

      totalDonated = returnedTokenDonations.reduce(
        (acc, d) => acc.sub(toBN(d.amount)),
        totalDonated,
      );

      const donationCount = tokenDonations.filter(
        d => !d.isReturn && ![DonationStatus.PAYING, DonationStatus.PAID].includes(d.status),
      ).length;

      // find the first donation in the group that has a token object
      // b/c there are other donation objects coming through as well
      const tokenDonation = tokenDonations.find(d => typeof d.token === 'object');

      return {
        name: tokenDonation.token.name,
        address: tokenDonation.token.address,
        foreignAddress: tokenDonation.token.foreignAddress,
        decimals: tokenDonation.token.decimals,
        symbol,
        totalDonated,
        currentBalance,
        donationCount,
      };
    });
    const { token, maxAmount } = entity;
    const fullyFunded =
      type === AdminTypes.MILESTONE &&
      donationCounters.length > 0 &&
      token.foreignAddress !== ANY_TOKEN.foreignAddress &&
      maxAmount &&
      toBN(maxAmount)
        .sub(donationCounters.find(dc => dc.symbol === token.symbol).totalDonated)
        .lt(toBN(10 ** (18 - Number(token.decimals))));

    const peopleCount = new Set(donations.map(d => d.giverAddress)).size;

    await service.patch(entity._id, {
      donationCounters,
      peopleCount,
      fullyFunded,
    });
  } catch (error) {
    logger.error(`error updating counters for ${type} - ${id}: `, error);
  }
};

const createPaymentConversation = async (context, donation, milestoneId) => {
  const { app, method } = context;
  // Create payment conversation
  if (method === 'create' && donation.status === DonationStatus.PAID) {
    const { txHash } = donation;
    const events = (
      await app.service('events').find({
        query: {
          transactionHash: donation.txHash,
          event: 'Transfer',
          status: { $nin: [EventStatus.PROCESSED, EventStatus.FAILED] },
        },
      })
    ).data;
    // we should make sure all transfer events for this transactionHash settled so events should be empty
    if (events.length !== 0) {
      logger.info(
        'Dont create conversation when there is unProcessed Transfer events for a transactionHash',
      );
      return;
    }

    try {
      const milestone = await app.service('milestones').get(milestoneId);
      const { recipient } = milestone;
      const donations = (
        await app.service('donations').find({
          query: {
            ownerTypeId: milestoneId,
            status: DonationStatus.PAID,
            txHash,
          },
        })
      ).data;
      const payments = [];

      // why our linter has problem with for..of ?
      /* eslint-disable no-restricted-syntax */
      for (const donationItem of donations) {
        const { amount } = donationItem;
        const { symbol, decimals } = donationItem.token;
        payments.push({
          amount,
          symbol,
          tokenDecimals: decimals,
        });
      }
      const conversation = await app.service('conversations').create(
        {
          milestoneId,
          messageContext: 'payment',
          txHash,
          payments,
          recipientAddress: recipient.address,
        },
        { performedByAddress: donation.actionTakerAddress },
      );
      if (milestone.recipient && milestone.recipient.email) {
        // now we dont send donations-collected email for milestones that don't have recipient
        await donationsCollected(app, {
          recipient: milestone.recipient.email,
          user: milestone.recipient.name,
          milestoneTitle: milestone.title,
          milestoneId: milestone._id,
          campaignId: milestone.campaignId,
          conversation,
        });
      }
      logger.info(
        `Currently we dont send email for milestones who doesnt have recipient, milestoneId: ${milestoneId}`,
      );
    } catch (e) {
      logger.error('createConversation and send collectedEmail error', e);
    }
  }
};

const updateDonationEntity = async (context, donation) => {
  if (!donation.mined) return;
  const { app } = context;
  if (donation.isReturn) {
    // update parentDonation entities to account for the return
    app
      .service('donations')
      .find({
        paginate: false,
        query: {
          _id: { $in: donation.parentDonations },
        },
      })
      .then(donations =>
        donations
          // set isReturn = false b/c so we don't recursively update parent donations
          .map(d => ({ ...d, isReturn: false }))
          .forEach(d => updateDonationEntity(context, d)),
      );
  }

  let entityId;
  let type;
  if (donation.delegateTypeId) {
    type = AdminTypes.DAC;
    entityId = donation.delegateTypeId;
  } else if (donation.ownerType === AdminTypes.CAMPAIGN) {
    type = AdminTypes.CAMPAIGN;
    entityId = donation.ownerTypeId;
  } else if (donation.ownerType === AdminTypes.MILESTONE) {
    type = AdminTypes.MILESTONE;
    entityId = donation.ownerTypeId;
    createPaymentConversation(context, donation, entityId);
  } else {
    return;
  }

  updateEntity(context.app, entityId, type);
};

const updateDonationEntityCountersHook = () => async context => {
  checkContext(context, 'after', ['create', 'patch']);
  if (context.params.skipEntityCounterUpdate) return context;
  if (Array.isArray(context.result)) {
    context.result.map(updateDonationEntity.bind(null, context));
  } else {
    updateDonationEntity(context, context.result);
  }
  return context;
};

module.exports = {
  updateEntity,
  updateDonationEntityCountersHook,
  createPaymentConversation,
};
