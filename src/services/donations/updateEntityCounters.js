const { checkContext } = require('feathers-hooks-common');
const { toBN } = require('web3-utils');
const logger = require('winston');

const { AdminTypes } = require('../../models/pledgeAdmins.model');
const { DonationStatus } = require('../../models/donations.model');

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
    $select: ['amount', 'giverAddress', 'amountRemaining'],
    isReturn: false,
    mined: true,
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

    const totalDonated = donations
      .reduce(
        (accumulator, d) =>
          accumulator.add(
            // use amountRemaining for milestones b/c excess will be sent back in case of over donation
            toBN(donation.ownerType === AdminTypes.MILESTONE ? d.amountRemaining : d.amount),
          ),
        toBN(0),
      )
      .toString();

    // NOTE: Using === to compare as both of these are strings and amounts in wei
    const fullyFunded =
      donation.ownerType === AdminTypes.MILESTONE && entity.maxAmount === totalDonated;
    const peopleCount = new Set(donations.map(d => d.giverAddress)).size;
    const donationCount = donations.filter(
      d => ![DonationStatus.PAYING, DonationStatus.PAID].includes(d.status),
    ).length;

    await service.patch(entity._id, { donationCount, totalDonated, peopleCount, fullyFunded });
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
