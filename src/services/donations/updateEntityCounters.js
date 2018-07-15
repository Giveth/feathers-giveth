const { checkContext } = require('feathers-hooks-common');
const { toBN } = require('web3-utils');
const logger = require('winston');

const { AdminTypes } = require('../../models/pledgeAdmins.model');

const updateEntity = async (context, donation) => {
  if (!donation.mined) return;

  let serviceName;
  let id;
  const donationQuery = {
    $select: ['amount', 'giverAddress'],
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
    });
  } else if (donation.ownerType === AdminTypes.CAMPAIGN) {
    serviceName = 'campaigns';
    id = donation.ownerTypeId;
    Object.assign(donationQuery, {
      ownerTypeId: id,
      ownerType: AdminTypes.CAMPAIGN,
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
      .reduce((accumulator, d) => accumulator.add(toBN(d.amount)), toBN(0))
      .toString();
    const peopleCount = new Set(donations.map(d => d.giverAddress)).size;
    const donationCount = donations.length;

    await service.patch(entity._id, { donationCount, totalDonated, peopleCount });
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
