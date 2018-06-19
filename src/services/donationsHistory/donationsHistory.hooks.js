// import errors from 'feathers-errors';
import { disallow } from 'feathers-hooks-common';
import onlyInternal from '../../hooks/onlyInternal';
import { populate } from 'feathers-hooks-common';
import { toBN } from 'web3-utils';
import _ from 'underscore';

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
  const updateEntity = data => {
    let serviceName;
    let id;
    let donationQuery;

    if (data.ownerType.toLowerCase() === 'giver') {
      return Promise.resolve(context);
    } else if (data.ownerType.toLowerCase() === 'campaign') {
      serviceName = 'campaigns';
      id = data.ownerId;
      donationQuery = { ownerId: id, $select: ['ownerId'] };
    } else if (data.ownerType.toLowerCase() === 'milestone') {
      serviceName = 'milestones';
      id = data.ownerId;
      donationQuery = { ownerId: id, $select: ['ownerId'] };
    } else if (data.delegateId) {
      serviceName = 'dacs';
      id = data.delegateId;
      donationQuery = { delegateId: id, $select: ['ownerId'] };
    }

    const service = context.app.service(serviceName);

    if (!service) return Promise.resolve();

    return service
      .get(id)
      .then(entity => {
        let totalDonated = entity.totalDonated || 0;
        let donationCount = entity.donationCount || 0;
        let peopleCount = entity.peopleCount || 0;

        if (typeof donationCount !== 'number') {
          donationCount = parseInt(donationCount);
        }

        context.app
          .service('donations/history')
          .find({
            query: donationQuery,
            $select: ['ownerId'],
          })
          .then(donationsForEntity => {
            peopleCount = _.uniq(_.pluck(donationsForEntity.data, 'ownerId')).length;

            const amount = toBN(data.amount);
            if (amount > 0) donationCount += 1; // incoming donation
            totalDonated = toBN(totalDonated)
              .add(amount)
              .toString();

            return service.patch(entity._id, { donationCount, totalDonated, peopleCount });
          });
      })
      .catch(error => {
        console.error(error); // eslint-disable-line no-console
        return context;
      });
  };

  const updateEntities = data => {
    const toData = {
      ownerType: data.ownerType,
      ownerId: data.ownerId,
      delegateId: data.delegateId,
      amount: data.amount,
    };

    if (!data.fromDonationId) return updateEntity(toData);

    const fromData = {
      ownerType: data.fromOwnerType,
      ownerId: data.fromOwnerId,
      delegateId: data.delegateId,
      amount: `-${data.amount}`,
    };

    return Promise.all([updateEntity(toData), updateEntity(fromData)]);
  };

  if (Array.isArray(context.data)) {
    return Promise.all([...context.data.map(updateEntities)]).then(() => context);
  }

  return updateEntities(context.data).then(() => context);
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

export default {
  before: {
    all: [],
    find: [],
    get: [],
    create: [onlyInternal(), updateType()],
    update: [disallow()],
    patch: [disallow()],
    remove: [disallow()],
  },

  after: {
    all: [populate({ schema })],
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
