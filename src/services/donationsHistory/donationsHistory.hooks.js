// import errors from 'feathers-errors';
import { disallow } from 'feathers-hooks-common';
import onlyInternal from '../../hooks/onlyInternal';
import { populate } from 'feathers-hooks-common';
import { toBN } from 'web3-utils';

// // A hook that updates `data` with the route parameter
// const mapDonationIdToQuery = () => (context) => {
//   if (!context.params.query.donationId && context.params.donationId) {
//     context.params.query.donationId = context.params.donationId;
//     return context;
//   }
//
//   throw new errors.NotImplemented('create is not implemented on this service. You must use /donations/:donationId/history service');
// };
//
// // A hook that updates `data` with the route parameter
// const mapDonationIdToData = () => (context) => {
//   console.log(context.data);
//   console.log(context.params);
//   if (context.data && context.params.donationId) {
//     context.data.donationId = context.params.donationId;
//     return context;
//   }
//
//   throw new errors.NotImplemented('create is not implemented on this service. You must use /donations/:donationId/history service');
// };

const updateType = () => context => {
  const { data } = context;

  let serviceName;
  let id;

  if (data.ownerType.toLowerCase() === 'campaign') {
    serviceName = 'campaigns';
    id = data.ownerId;
  }
  else if (data.ownerType.toLowerCase() === 'milestone') {
    serviceName = 'milestones';
    id = data.ownerId;
  } else if (data.delegateId) {
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
      totalDonated = toBN(totalDonated).add(toBN(data.amount)).toString();

      return service.patch(entity._id, { donationCount, totalDonated })
        .then(() => context);
    })
    .catch((error) => {
      console.error(error); // eslint-disable-line no-console
      return context;
    });
};

const schema = {
  include: [
    {
      service: 'users',
      nameAs: 'giver',
      parentField: 'giverAddress',
      childField: 'address',
    },
  ],
};

//TODO require donationID
export default {
  before: {
    all: [],
    find: [],
    get: [],
    create: [ onlyInternal(), updateType() ],
    update: [ disallow() ],
    patch: [ disallow() ],
    remove: [ disallow() ],
  },

  after: {
    all: [ populate({ schema }) ],
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

// export const nestedHistoryHooks = {
//   before: {
//     all: [],
//     find: [ mapDonationIdToQuery() ],
//     get: [],
//     create: [ onlyInternal(), mapDonationIdToData() ],
//     update: [ disallow() ],
//     patch: [ disallow() ],
//     remove: [ disallow() ],
//   },
//
//   after: {
//     all: [],
//     find: [],
//     get: [],
//     create: [],
//     update: [],
//     patch: [],
//     remove: [],
//   },
//
//   error: {
//     all: [],
//     find: [],
//     get: [],
//     create: [],
//     update: [],
//     patch: [],
//     remove: [],
//   },
// };
