const { checkContext } = require('feathers-hooks-common');
const { toBN } = require('web3-utils');
const logger = require('winston');

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

    // first group by token (symbol)
    const groupedDonations = _groupBy(donations, d => (d.token && d.token.symbol) || 'ETH');

    // and calculate cumulative token balances for each donated token
    const donationCounters = Object.keys(groupedDonations).map(symbol => {
      const tokenDonations = groupedDonations[symbol];

      const { totalDonated, currentBalance } = tokenDonations
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
        donationCounters.find(dc => dc.symbol === entity.token.symbol).currentBalance.toString();
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

const updateDonationEntity = async (context, donation) => {
  if (!donation.mined) return;

  if (donation.isReturn) {
    // update parentDonation entities to account for the return
    context.app
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

  let id;
  let type;
  if (donation.delegateTypeId) {
    type = AdminTypes.DAC;
    id = donation.delegateTypeId;
  } else if (donation.ownerType === AdminTypes.CAMPAIGN) {
    type = AdminTypes.CAMPAIGN;
    id = donation.ownerTypeId;
  } else if (donation.ownerType === AdminTypes.MILESTONE) {
    type = AdminTypes.MILESTONE;
    id = donation.ownerTypeId;
  } else {
    return;
  }

  updateEntity(context.app, id, type);
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
