import { populate, discard, setByDot } from 'feathers-hooks-common';
import { restrictToOwner } from 'feathers-authentication-hooks';

import sanitizeAddress from '../../hooks/sanitizeAddress';

const restrict = [
  restrictToOwner({
    idField: 'address',
    ownerField: 'ownerAddress',
  }),
];

const setAddress = context => {
  setByDot(context.data, 'ownerAddress', context.params.user.address);
  return context;
};

const address = [
  discard('ownerAddress'),
  setAddress,
  sanitizeAddress('ownerAddress', { required: true, validate: true }),
];

const schema = {
  include: [
    {
      service: 'users',
      nameAs: 'owner',
      parentField: 'ownerAddress',
      childField: 'address',
    },
  ],
};


module.exports = {
  before: {
    all: [],
    find: [ sanitizeAddress('ownerAddress') ],
    get: [],
    create: [ ...address ],
    update: [ ...restrict, ...address ],
    patch: [ ...restrict, ...address ],
    remove: [ sanitizeAddress('ownerAddress'), ...restrict ],
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
