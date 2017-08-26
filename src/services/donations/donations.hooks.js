/* eslint-disable no-unused-vars */
import errors from 'feathers-errors';
import { discard, setByDot } from 'feathers-hooks-common';
import { restrictToOwner } from 'feathers-authentication-hooks';

import sanitizeAddress from '../../hooks/sanitizeAddress';

const restrict = [
  restrictToOwner({
    idField: 'address',
    ownerField: 'donorAddress',
  }),
];

const setAddress = context => {
  setByDot(context.data, 'donorAddress', context.params.user.address);
  return context;
};

const address = [
  discard('donorAddress'),
  setAddress,
  sanitizeAddress('donorAddress', { required: true, validate: true }),
];

const updateType = () => {
  return context => {
    const { data } = context;

    switch (data.type) {
    case 'cause': {
      const service = context.app.service('causes');

      return service.get(data._id)
        .then(cause => {
          //TODO update counters on the cause

        })
        .catch(() => context);
    }
    case 'campaign': {
      const service = context.app.service('campaigns');
      //TODO update counters on the campaign
      return context;
    }
    case 'milestone': {
      const service = context.app.service('milestones');
      //TODO update counters on the milestone
      return context;
    }
    default: {
      return new errors.BadRequest('Invalid type. Must be one of [\'cause\', \'campaign\', \'milestone\'].');
    }
    }

  };
};


module.exports = {
  before: {
    all: [],
    find: [ sanitizeAddress('donorAddress') ],
    get: [],
    create: [ ...address ],
    update: [ ...restrict, ...address ],
    patch: [ ...restrict, ...address ],
    remove: [ sanitizeAddress('donorAddress'), ...restrict ],
  },

  after: {
    all: [],
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
