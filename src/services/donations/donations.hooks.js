/* eslint-disable no-unused-vars */
const errors = require('@feathersjs/errors');
const commons = require('feathers-hooks-common');

const sanitizeAddress = require('../../hooks/sanitizeAddress');
const setAddress = require('../../hooks/setAddress');
const addConfirmations = require('../../hooks/addConfirmations');
const { DonationStatus } = require('../../models/donations.model');
const { AdminTypes } = require('../../models/pledgeAdmins.model');
const { MilestoneStatus } = require('../../models/milestones.model');

const updateEntityCounters = require('./updateEntityCounters');

const restrict = () => async context => {
  // internal call are fine
  if (!context.params.provider) return context;

  throw new errors.Forbidden();
  const { data, service } = context;
  const { user } = context.params;

  if (!user) throw new errors.NotAuthenticated();

  let donations = [];
  if (context.id)
    donations = await service.get(context.id, { paginate: false, schema: 'includeTypeDetails' });
  if (!context.id && context.params.query)
    donations = await service.find({
      paginate: false,
      query: context.params.query,
      schema: 'includeTypeDetails',
    });

  const canUpdate = async donation => {
    if (!donation) throw new errors.Forbidden();

    if (
      data.status === DonationStatus.PENDING &&
      (data.intendedProjectTypeId || data.delegateTypeId !== donation.delegateTypeId)
    ) {
      // delegate made this call
      if (
        user.address !== donation.ownerTypeId &&
        user.address !== donation.delegateEntity.ownerAddress
      )
        throw new errors.Forbidden();

      // whitelist of what the delegate can update
      const approvedKeys = [
        // 'txHash',
        'status',
        // 'delegateId',
        // 'delegateTypeId',
        // 'intendedProjectId',
        // 'intendedProjectTypeId',
        // 'intendedProjectType',
      ];

      const keysToRemove = Object.keys(data).map(key => !approvedKeys.includes(key));
      keysToRemove.forEach(key => delete data[key]);
    } else if (
      (donation.ownerType === AdminTypes.GIVER && user.address !== donation.ownerTypeId) ||
      (donation.ownerType !== AdminTypes.GIVER &&
        user.address !== donation.ownerEntity.ownerAddress)
    ) {
      throw new errors.Forbidden();
    }
  };

  if (Array.isArray(donations)) {
    await Promise.all(donations.map(canUpdate));
  } else {
    await canUpdate(donations);
  }
};

const poSchemas = {
  'po-giver': {
    include: [
      {
        service: 'users',
        nameAs: 'giver',
        parentField: 'giverAddress',
        childField: 'address',
      },
    ],
  },
  'po-giver-owner': {
    include: [
      {
        service: 'users',
        nameAs: 'ownerEntity',
        parentField: 'giverAddress',
        childField: 'address',
      },
    ],
  },
  'po-campaign': {
    include: [
      {
        service: 'campaigns',
        nameAs: 'ownerEntity',
        parentField: 'ownerTypeId',
        childField: '_id',
        useInnerPopulate: true,
      },
    ],
  },
  'po-campaign-intended': {
    include: [
      {
        service: 'campaigns',
        nameAs: 'intendedEntity',
        parentField: 'intendedProjectId',
        childField: 'projectId',
        useInnerPopulate: true,
      },
    ],
  },
  'po-dac': {
    include: [
      {
        service: 'dacs',
        nameAs: 'delegateEntity',
        parentField: 'delegateTypeId',
        childField: '_id',
        useInnerPopulate: true,
      },
    ],
  },
  'po-milestone': {
    include: [
      {
        service: 'milestones',
        nameAs: 'ownerEntity',
        parentField: 'ownerTypeId',
        childField: '_id',
        useInnerPopulate: true,
      },
    ],
  },
  'po-milestone-intended': {
    include: [
      {
        service: 'milestones',
        nameAs: 'intendedEntity',
        parentField: 'intendedProjectId',
        childField: 'projectId',
        useInnerPopulate: true,
      },
    ],
  },
};

// a bit of a hacky way to be able to revert donations if the tx failed.
const stashDonationIfPending = () => context => {
  // only deal with single donation patchs
  if (!context.id) return context;

  const { data } = context;

  if (data.status === DonationStatus.PENDING) {
    return context.app
      .service('donations')
      .get(context.id)
      .then(donation => {
        data.previousState = donation;

        return context;
      })
      .catch(console.error);
  }

  // if not pending status, remove previousState from donation as it isn't needed
  if (data.$unset) {
    data.$unset.previousState = true;
  } else {
    data.$unset = {
      previousState: true,
    };
  }

  return context;
};

const joinDonationRecipient = (item, context) => {
  const newContext = Object.assign({}, context, { result: item });

  let ownerSchema;
  // if this is po-giver schema, we need to change the `nameAs` to ownerEntity
  if (item.ownerType.toLowerCase() === 'giver') {
    ownerSchema = poSchemas['po-giver-owner'];
  } else {
    ownerSchema = poSchemas[`po-${item.ownerType.toLowerCase()}`];
  }

  return commons
    .populate({ schema: ownerSchema })(newContext)
    .then(
      context =>
        item.delegateId ? commons.populate({ schema: poSchemas['po-dac'] })(context) : context,
    )
    .then(
      context =>
        item.intendedProjectId > 0
          ? commons.populate({
              schema: poSchemas[`po-${item.intendedProjectType.toLowerCase()}-intended`],
            })(context)
          : context,
    )
    .then(context => context.result);
};

const updateMilestoneIfNotPledged = () => context => {
  commons.checkContext(context, 'before', ['create']);

  const { data: donation } = context;
  if (
    donation.ownerType === AdminTypes.MILESTONE &&
    [DonationStatus.PAYING, DonationStatus.PAID].includes(donation.status)
  ) {
    // return context.app.service('milestones').patch(donation.ownerTypeId, {
    context.app.service('milestones').patch(donation.ownerTypeId, {
      status:
        donation.status === DonationStatus.PAYING ? MilestoneStatus.PAYING : MilestoneStatus.PAID,
      // mined: true
    });
  }
};

const populateSchema = () => context => {
  if (context.params.schema === 'includeGiverDetails') {
    return commons.populate({ schema: poSchemas['po-giver'] })(context);
  } else if (['includeTypeDetails', 'includeTypeAndGiverDetails'].includes(context.params.schema)) {
    if (context.params.schema === 'includeTypeAndGiverDetails') {
      commons.populate({ schema: poSchemas['po-giver'] })(context);
    }

    const items = commons.getItems(context);

    // items may be undefined if we are removing by id;
    if (items === undefined) return context;

    if (Array.isArray(items)) {
      const promises = items.map(item => joinDonationRecipient(item, context));

      return Promise.all(promises).then(results => {
        commons.replaceItems(context, results);
        return context;
      });
    }
    return joinDonationRecipient(items, context).then(result => {
      commons.replaceItems(context, result);
      return context;
    });
  }

  return context;
};

module.exports = {
  before: {
    all: [commons.paramsFromClient('schema')],
    find: [sanitizeAddress('giverAddress')],
    get: [],
    create: [
      setAddress('giverAddress'),
      sanitizeAddress('giverAddress', {
        required: true,
        validate: true,
      }),
      updateMilestoneIfNotPledged(),
    ],
    update: [commons.disallow('external'), sanitizeAddress('giverAddress', { validate: true })],
    patch: [
      // restrict(),
      commons.disallow('external'),
      sanitizeAddress('giverAddress', { validate: true }),
      stashDonationIfPending(),
    ],
    remove: [commons.disallow()],
  },

  after: {
    all: [populateSchema()],
    find: [addConfirmations()],
    get: [addConfirmations()],
    create: [updateEntityCounters()],
    update: [],
    patch: [],
    remove: [],
  },

  error: {
    all: [],
    find: [],
    get: [],
    create: [],
    update: [],
    patch: [],
    remove: [],
  },
};
