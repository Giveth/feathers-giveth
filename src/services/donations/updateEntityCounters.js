const { checkContext } = require('feathers-hooks-common');
const { toBN } = require('web3-utils');
const logger = require('winston');
const semaphore = require('semaphore');

const { AdminTypes } = require('../../models/pledgeAdmins.model');
const { DonationStatus } = require('../../models/donations.model');
const { MilestoneTypes } = require('../../models/milestones.model');
const { ANY_TOKEN } = require('../../blockchain/lib/web3Helpers');
const _groupBy = require('lodash.groupby');

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
      $or: [{ intendedProjectId: 0 }, { intendedProjectId: undefined }],
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

    const fullyFunded =
      type === AdminTypes.MILESTONE &&
      donationCounters.length > 0 &&
      entity.token.foreignAddress !== ANY_TOKEN.foreignAddress &&
      entity.maxAmount ===
      donationCounters.find(dc => dc.symbol === entity.token.symbol).totalDonated.toString();

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

const conversationSem = semaphore();

const createConversation = async (context, donation, milestoneId) => {
  const { app, method } = context;
  // Create payment conversation
  if (method === 'create' && donation.status === DonationStatus.PAID) {
    app
      .service('milestones')
      .get(milestoneId)
      .then(milestone => {
        const { recipient } = milestone;
        const { txHash, amount } = donation;
        const symbol = donation.token.symbol;
        const service = app.service('conversations');

        conversationSem.take(async () => {

          try {
            const data = await service.find({
              paginate: false,
              query: {
                milestoneId: milestoneId,
                messageContext: 'payment',
                txHash: txHash,
                $limit: 1,
              },
            });

            if (data.length > 0) {
              const conversation = data[0];
              const payments = conversation.payments || [];
              const index = payments.findIndex(p => p.symbol === symbol);

              if (index !== -1) {
                payments[index].amount = toBN(amount).add(toBN(payments[index].amount)).toString();
              } else {
                payments.push({ symbol: symbol, amount: amount });
              }

              await service.patch(
                conversation._id,
                {
                  payments: payments,
                },
              );
            } else {
              await service.create(
                {
                  milestoneId: milestoneId,
                  messageContext: 'payment',
                  txHash: txHash,
                  payments: [{
                    amount: amount,
                    symbol: symbol,
                  }],
                  recipientAddress: recipient.address,
                },
                { performedByAddress: context.params.from },
              );
            }
          } catch (e) {
            logger.error('could not create conversation', e);
          } finally {
            conversationSem.leave();
          }
        });
      })
      .catch(e => logger.error('Could not find milestone', e));
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
          .map(d => Object.assign({}, d, { isReturn: false }))
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
    createConversation(context, donation, entityId);
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
};
