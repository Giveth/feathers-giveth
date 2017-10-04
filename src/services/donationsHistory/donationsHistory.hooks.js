// import errors from 'feathers-errors';
import { disallow } from 'feathers-hooks-common';
import onlyInternal from '../../hooks/onlyInternal';
import { populate } from 'feathers-hooks-common';

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

const schema = {
  include: [
    {
      service: 'users',
      nameAs: 'donor',
      parentField: 'ownerId',
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
    create: [ onlyInternal() ],
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
