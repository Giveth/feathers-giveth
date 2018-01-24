/* eslint-disable no-unused-vars */
import errors from 'feathers-errors';
import commons from 'feathers-hooks-common';

import sanitizeAddress from '../../hooks/sanitizeAddress';
import setAddress from '../../hooks/setAddress';
import { updatedAt, createdAt } from '../../hooks/timestamps';


const restrict = () => (context) => {
  // internal call are fine
  if (!context.params.provider) return context;

  const { data, service } = context;
  const { user } = context.params;

  if (!user) throw new errors.NotAuthenticated();


  const getDonations = () => {
    if (context.id) return service.get(context.id, { schema: 'includeTypeDetails' });
    if (!context.id && context.params.query) return service.find({ query: context.params.query, schema: 'includeTypeDetails' });
    return undefined;
  };

  const canUpdate = (donation) => {
    if (!donation) throw new errors.Forbidden();

    if (data.status === 'pending' && (data.intendedProjectId || data.delegateId !== donation.delegateId)) {
      // delegate made this call
      if (user.address !== donation.ownerId && user.address !== donation.delegateEntity.ownerAddress) throw new errors.Forbidden();

      // whitelist of what the delegate can update
      const approvedKeys = ['txHash', 'status', 'delegate', 'delegateId', 'intendedProject', 'intendedProjectId', 'intendedProjectType'];

      const keysToRemove = Object.keys(data).map(key => !approvedKeys.includes(key));
      keysToRemove.forEach(key => delete data[key]);
    } else if ((donation.ownerType === 'giver' && user.address !== donation.ownerId) ||
      (donation.ownerType !== 'giver' && user.address !== donation.ownerEntity.ownerAddress)) {
      throw new errors.Forbidden();
    }
  };

  return getDonations()
    .then(donations => ((Array.isArray(donations)) ? donations.forEach(canUpdate) : canUpdate(donations)));
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
        parentField: 'ownerId',
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
        parentField: 'intendedProject',
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
        parentField: 'delegateId',
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
        parentField: 'ownerId',
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
        parentField: 'intendedProject',
        childField: 'projectId',
        useInnerPopulate: true,
      },
    ],
  },
};

// a bit of a hacky way to be able to revert donations if the tx failed.
const stashDonationIfPending = () => (context) => {
  // only deal with single donation patchs
  if (!context.id) return context;

  const { data } = context;

  if (data.status === 'pending') {
    return context.app.service('donations').get(context.id)
      .then((donation) => {
        data.previousState = donation;

        return context;
      }).catch(console.error);
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

  return commons.populate({ schema: ownerSchema })(newContext)
    .then(context => ((item.delegate) ? commons.populate({ schema: poSchemas['po-dac'] })(context) : context))
    .then(context => ((item.intendedProject > 0) ? commons.populate({ schema: poSchemas[`po-${item.intendedProjectType.toLowerCase()}-intended`] })(context) : context))
    .then(context => context.result);
};

const populateSchema = () => (context) => {
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

      return Promise.all(promises)
        .then((results) => {
          commons.replaceItems(context, results);
          return context;
        });
    }
    return joinDonationRecipient(items, context)
      .then((result) => {
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
    create: [setAddress('giverAddress'), sanitizeAddress('giverAddress', {
      required: true,
      validate: true,
    }, createdAt),
    (context) => {
      if (context.data.createdAt) return context;
      context.data.createdAt = new Date();
    }],
    update: [restrict(), sanitizeAddress('giverAddress', { validate: true }), updatedAt],
    patch: [restrict(), sanitizeAddress('giverAddress', { validate: true }), stashDonationIfPending(), updatedAt],
    remove: [commons.disallow()],
  },

  after: {
    all: [populateSchema()],
    find: [],
    get: [],
    create: [],
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
