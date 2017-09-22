/* eslint-disable no-unused-vars */
import errors from 'feathers-errors';
import commons from 'feathers-hooks-common';
import { restrictToOwner } from 'feathers-authentication-hooks';

import sanitizeAddress from '../../hooks/sanitizeAddress';

const restrict = [
  // restrictToOwner({
  //   idField: 'address',
  //   ownerField: 'donorAddress',
  // }),
];

const setAddress = context => {
  commons.setByDot(context.data, 'donorAddress', context.params.user.address);
  return context;
};

const address = [
  commons.discard('donorAddress'),
  setAddress,
  sanitizeAddress('donorAddress', { required: true, validate: true }),
];

const updateType = () => {
  return context => {
    const { data } = context;

    let service;
    switch (data.type) {
    case 'dac': {
      service = context.app.service('causes');
      break;
    }
    case 'campaign': {
      service = context.app.service('campaigns');
      break;
    }
    case 'milestone': {
      service = context.app.service('milestones');
      break;
    }
    default: {
      throw new errors.BadRequest('Invalid type. Must be one of [\'dac\', \'campaign\', \'milestone\'].');
    }
    }

    return service.get(data.type_id)
      .then(entity => {
        let donations = entity.donations || 0;
        let donationCount = entity.donationCount || 0;

        donationCount += 1;
        donations += data.amount;

        return service.patch(entity._id, { donationCount, donations })
          .then(() => context);
      })
      .catch((error) => {
        console.error(error); // eslint-disable-line no-console
        return context;
      });
  };
};

const poSchemas = {
  'po-donor': {
    include: [
      {
        service: 'users',
        nameAs: 'donor',
        parentField: 'donorAddress',
        childField: 'address',
      },
    ],
  },
  'po-campaign': {
    include: [
      {
        service: 'campaigns',
        nameAs: 'campaign',
        parentField: 'type_id',
        childField: '_id',
        useInnerPopulate: true,
      },
    ],
  },
  'po-dac': {
    include: [
      {
        service: 'causes',
        nameAs: 'dac',
        parentField: 'type_id',
        childField: '_id',
        useInnerPopulate: true,
      },
    ],
  },
  'po-milestone': {
    include: [
      {
        service: 'milestones',
        nameAs: 'milestone',
        parentField: 'type_id',
        childField: '_id',
        useInnerPopulate: true,
      },
    ],
  },
};

const joinType = (item, context, schema) => {
  const newContext = Object.assign({}, context, { result: item });

  return commons.populate({ schema })(newContext)
    .then(context => context.result);

};

const populateSchema = () => {
  return (context) => {

    if (context.params.schema === 'includeDonorDetails') {
      return commons.populate({ schema: poSchemas[ 'po-donor' ] })(context);
    } else if (context.params.schema === 'includeTypeDetails') {
      const items = commons.getItems(context);

      // items may be undefined if we are removing by id;
      if (items === undefined) return context;


      if (Array.isArray(items)) {
        const promises = [];
        items.forEach(item => promises.push(joinType(item, context, poSchemas[ `po-${item.type}` ])));

        return Promise.all(promises)
          .then(results => {
            commons.replaceItems(context, results);
            return context;
          });
      } else {
        return joinType(items, context, poSchemas[ `po-${items.type}` ])
          .then(result => {
            commons.replaceItems(context, result);
            return context;
          });
      }
    }

    return context;
  };
};


module.exports = {
  before: {
    all: [ commons.paramsFromClient('schema') ],
    find: [ sanitizeAddress('donorAddress') ],
    get: [],
    create: [ ...address, updateType(),
      (context) => {
        context.data.createdAt = new Date();
      },
    ],
    update: [ ...restrict, ...address ],
    patch: [ ...restrict, ...address ],
    remove: [ sanitizeAddress('donorAddress'), ...restrict ],
  },

  after: {
    all: [ populateSchema() ],
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
