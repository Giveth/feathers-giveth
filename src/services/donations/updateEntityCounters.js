const { checkContext } = require('feathers-hooks-common');
const { toBN } = require('web3-utils');
const logger = require('winston');

const { AdminTypes } = require('../../models/pledgeAdmins.model');
const { DonationStatus } = require('../../models/donations.model');
const _groupBy = require('lodash.groupby');

const updateEntity = async (context, donation) => {
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
          .forEach(d => updateEntity(context, d)),
      );
  }

  let serviceName;
  let id;
  const donationQuery = {
    $select: ['amount', 'giverAddress', 'amountRemaining', 'token'],
    isReturn: false,
    mined: true,
    status: { $nin: [DonationStatus.FAILED] },
  };

  if (donation.delegateTypeId) {
    serviceName = 'dacs';
    id = donation.delegateTypeId;
    // TODO I think this can be gamed if the donor refunds their donation from the dac
    Object.assign(donationQuery, {
      delegateTypeId: id,
      delegateType: AdminTypes.DAC,
      $or: [{ intendedProjectId: 0 }, { intendedProjectId: undefined }],
      isReturn: false,
    });
  } else if (donation.ownerType === AdminTypes.CAMPAIGN) {
    serviceName = 'campaigns';
    id = donation.ownerTypeId;
    Object.assign(donationQuery, {
      ownerTypeId: id,
      ownerType: AdminTypes.CAMPAIGN,
      isReturn: false,
    });
  } else if (donation.ownerType === AdminTypes.MILESTONE) {
    serviceName = 'milestones';
    id = donation.ownerTypeId;
    Object.assign(donationQuery, {
      ownerTypeId: id,
      ownerType: AdminTypes.MILESTONE,
    });
  } else {
    return;
  }

  const service = context.app.service(serviceName);
  try {
    const entity = await service.get(id);

    const donations = await context.app
      .service('donations')
      .find({ paginate: false, query: donationQuery });

    // first group by token (symbol)
    const groupedDonations = _groupBy(donations, d => (d.token && d.token.symbol) || 'ETH');

    // and calculate cumulative token balances for each donated token
    const donationCounters = Object.keys(groupedDonations).map(symbol => {
      const tokenDonations = groupedDonations[symbol];

      const { totalDonated, currentBalance } = tokenDonations.reduce(
        (accumulator, d) => ({
          totalDonated: accumulator.totalDonated.add(toBN(d.amount)),
          currentBalance: accumulator.currentBalance.add(toBN(d.amountRemaining)),
        }),
        {
          totalDonated: toBN(0),
          currentBalance: toBN(0),
        },
      );

      const donationCount = tokenDonations.filter(
        d => ![DonationStatus.PAYING, DonationStatus.PAID].includes(d.status),
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
      donation.ownerType === AdminTypes.MILESTONE &&
      entity.maxAmount ===
        donationCounters.find(dc => dc.symbol === entity.token.symbol).currentBalance.toString();
    const peopleCount = new Set(donations.map(d => d.giverAddress)).size;

    await service.patch(entity._id, {
      donationCounters,
      peopleCount,
      fullyFunded,
    });
  } catch (error) {
    logger.error(error);
  }
};

const updateEntityCounters = () => async context => {
  checkContext(context, 'after', ['create', 'patch']);
  if (Array.isArray(context.data)) {
    context.data.map(updateEntity.bind(null, context));
  } else {
    updateEntity(context, context.data);
  }
  return context;
};

module.exports = updateEntityCounters;
