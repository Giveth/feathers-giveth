/* eslint-disable no-unused-vars */
import errors from 'feathers-errors';
import commons from 'feathers-hooks-common';
import { restrictToOwner } from 'feathers-authentication-hooks';

import sanitizeAddress from '../../hooks/sanitizeAddress';
import setAddress from '../../hooks/setAddress';

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

    let serviceName;
    let id;

    // TODO need to update this logic to handle delegations/undelegations/cancelations etc.
    if (data.ownerType.toLowerCase() === 'campaign') {
      serviceName = 'campaigns';
      id = data.ownerId;
    }
    else if (data.ownerType.toLowerCase() === 'milestone') {
      serviceName = 'milestone';
      id = data.ownerId;
    } else if (data.delegate) {
      serviceName = 'dacs';
      id = data.delegateId;
    }

    const service = context.app.service(serviceName);

    if (!service) return;

    return service.get(id)
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
        parentField: 'ownerId',
        childField: '_id',
        useInnerPopulate: true,
      },
    ],
  },
  'po-campaign-proposed': {
    include: [
      {
        service: 'campaigns',
        nameAs: 'campaign',
        parentField: 'proposedProject',
        childField: 'projectId',
        useInnerPopulate: true,
      },
    ],
  },
  'po-dac': {
    include: [
      {
        service: 'dacs',
        nameAs: 'dac',
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
        nameAs: 'milestone',
        parentField: 'ownerId',
        childField: '_id',
        useInnerPopulate: true,
      },
    ],
  },
  'po-milestone-proposed': {
    include: [
      {
        service: 'milestones',
        nameAs: 'milestone',
        parentField: 'proposedProject',
        childField: 'projectId',
        useInnerPopulate: true,
      },
    ],
  },
};

const joinDonationRecipient = (item, context) => {
  let schema;
  const newContext = Object.assign({}, context, { result: item });

  if (item.delegate) schema = poSchemas[ 'po-dac' ];
  else if (item.proposedProject > 0) schema = poSchemas[ `po-${item.proposedProjectType.toLowerCase()}-proposed` ];
  else schema = poSchemas[ `po-${item.ownerType.toLowerCase()}` ];

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
        const promises = items.map(item => joinDonationRecipient(item, context));

        return Promise.all(promises)
          .then(results => {
            commons.replaceItems(context, results);
            return context;
          });
      } else {
        return joinDonationRecipient(items, context)
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
