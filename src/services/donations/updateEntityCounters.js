const { checkContext } = require('feathers-hooks-common');
const { toBN } = require('web3-utils');
const logger = require('winston');

const _groupBy = require('lodash.groupby');
const { AdminTypes } = require('../../models/pledgeAdmins.model');
const { DonationStatus } = require('../../models/donations.model');
const { TraceTypes } = require('../../models/traces.model');
const { ANY_TOKEN } = require('../../blockchain/lib/web3Helpers');

const ENTITY_SERVICES = {
  [AdminTypes.COMMUNITY]: 'communities',
  [AdminTypes.CAMPAIGN]: 'campaigns',
  [AdminTypes.TRACE]: 'traces',
};

const updateEntity = async (app, id, type) => {
  const serviceName = ENTITY_SERVICES[type];
  const donationQuery = {
    $select: ['amount', 'giverAddress', 'amountRemaining', 'tokenAddress', 'status', 'isReturn'],
    mined: true,
    status: { $nin: [DonationStatus.FAILED] },
  };

  if (type === AdminTypes.COMMUNITY) {
    // TODO I think this can be gamed if the donor refunds their donation from the dac
    Object.assign(donationQuery, {
      delegateTypeId: id,
      delegateType: AdminTypes.COMMUNITY,
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
  } else if (type === AdminTypes.TRACE) {
    Object.assign(donationQuery, {
      ownerTypeId: id,
      ownerType: AdminTypes.TRACE,
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
        $select: ['amount', 'tokenAddress', 'status'],
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
            (type === AdminTypes.TRACE && entity.type === TraceTypes.LPMilestone) ||
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
      type === AdminTypes.TRACE &&
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
    type = AdminTypes.COMMUNITY;
    entityId = donation.delegateTypeId;
  } else if (donation.ownerType === AdminTypes.CAMPAIGN) {
    type = AdminTypes.CAMPAIGN;
    entityId = donation.ownerTypeId;
  } else if (donation.ownerType === AdminTypes.TRACE) {
    type = AdminTypes.TRACE;
    entityId = donation.ownerTypeId;
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
