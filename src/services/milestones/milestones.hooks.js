import { populate } from 'feathers-hooks-common';
// import { restrictToOwner } from 'feathers-authentication-hooks';

import sanitizeAddress from '../../hooks/sanitizeAddress';
import setAddress from '../../hooks/setAddress';
import sanitizeHtml from '../../hooks/sanitizeHtml';

const restrict = [
  // restrictToOwner({
  //   idField: 'address',
  //   ownerField: 'ownerAddress',
  // }),
];

const address = [
  sanitizeAddress('pluginAddress', { required: true, validate: true }),
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
    find: [ sanitizeAddress([ 'ownerAddress', 'pluginAddress', 'reviewerAddress', 'recipientAddress' ]) ],
    get: [],
    create: [ setAddress('ownerAddress'), ...address, sanitizeHtml('description') ],
    update: [ ...restrict, ...address, sanitizeHtml('description') ],
    patch: [ ...restrict, sanitizeAddress(['pluginAddress', 'reviewerAddress', 'recipientAddress'], { validate: true }), sanitizeHtml('description') ],
    remove: [ sanitizeAddress([ 'pluginAddress', 'reviewerAddress', 'recipientAddress' ]), ...restrict ],
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
