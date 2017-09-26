/* eslint-disable no-unused-vars */
import errors from 'feathers-errors';
import commons from 'feathers-hooks-common';
import { restrictToOwner } from 'feathers-authentication-hooks';

import sanitizeAddress from '../../hooks/sanitizeAddress';
import setAddress from "../../hooks/setAddress";

// const restrict = [
//   restrictToOwner({
//     idField: 'address',
//     ownerField: 'donorAddress',
//   }),
// ];

// const restrict = () => context => {
//   //TODO allow delegates to modify the donation
//     if (context.id === null || context.id === undefined) {
//       throw new errors.BadRequest('Id is required.');
//     }
//
//     const params = context.method === 'get' ? context.params : {
//       provider: context.params.provider,
//       authenticated: context.params.authenticated,
//       user: context.params.user
//     };
//
//     params.query = params.query || {};
//
//     return context.service.get(context.id, params)
//       .then(donation => {
//         const addr = context.params.user.address;
//
//         switch (donation.type.lowerCase()) {
//           case 'dac':
//             // allow delegation
//             break;
//           case 'campaign':
//             break;
//           case 'milestone':
//             break
//         }
//
//         return context;
//       })
// }

const updateType = () => {
  return context => {
    const { data } = context;

    let service;
    switch (data.type.toLowerCase()) {
      case 'dac': {
        service = context.app.service('dacs');
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
        let totalDonated = entity.totalDonated || 0;
        let donationCount = entity.donationCount || 0;

        donationCount += 1;
        totalDonated += data.amount;

        return service.patch(entity._id, { donationCount, totalDonated })
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
        service: 'dacs',
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
    create: [ setAddress('donorAddress'), sanitizeAddress('donorAddress', { required: true, validate: true }), updateType(),
      (context) => {
        if (context.data.createdAt) return context;
        context.data.createdAt = new Date();
      },
    ],
    // update: [ ...restrict, ...address ],
    // patch: [ ...restrict, ...address ],
    update: [ sanitizeAddress('donorAddress', { validate: true }) ],
    patch: [ sanitizeAddress('donorAddress', { validate: true }) ],
    remove: [ commons.disallow() ],
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
