import { populate, discard } from 'feathers-hooks-common';
import { restrictToOwner } from 'feathers-authentication-hooks';

import sanitizeAddress from '../../hooks/sanitizeAddress';
import setAddress from '../../hooks/setAddress';

const restrict = [
  restrictToOwner({
    idField: 'address',
    ownerField: 'ownerAddress',
  }),
];

const address = [
  sanitizeAddress('ownerAddress', { required: true, validate: true }),
  sanitizeAddress([ 'reviewerAddress', 'recipientAddress' ], { required: false, validate: true }),
];

const schema = {
  include: [
    {
      service: 'users',
      nameAs: 'owner',
      parentField: 'ownerAddress',
      childField: 'address',
    },
    {
      service: 'users',
      nameAs: 'reviewer',
      parentField: 'reviewerAddress',
      childField: 'address',
    },
    {
      service: 'users',
      nameAs: 'recipient',
      parentField: 'recipientAddress',
      childField: 'address',
    },
  ],
};


module.exports = {
  before: {
    all: [],
    find: [ sanitizeAddress([ 'ownerAddress', 'reviewerAddress', 'recipientAddress' ]) ],
    get: [],
    create: [ discard('ownerAddress'), setAddress('ownerAddress'), ...address ],
    update: [ ...restrict, ...address ],
    patch: [ ...restrict, sanitizeAddress(['ownerAddress', 'reviewerAddress', 'recipientAddress'], { validate: true }) ],
    remove: [ sanitizeAddress([ 'ownerAddress', 'reviewerAddress', 'recipientAddress' ]), ...restrict ],
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
