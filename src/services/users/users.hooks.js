import commons from 'feathers-hooks-common';
import { restrictToOwner } from 'feathers-authentication-hooks';
import { toChecksumAddress } from 'web3-utils';

import notifyOfChange from '../../hooks/notifyOfChange';
import sanitizeAddress from '../../hooks/sanitizeAddress';
import setAddress from '../../hooks/setAddress';
import { updatedAt, createdAt } from '../../hooks/timestamps';

const normalizeId = () => {
  return context => {
    if (context.id) {
      context.id = toChecksumAddress(context.id);
    }
    return context;
  };
};

const restrict = [
  normalizeId(),
  restrictToOwner({
    idField: 'address',
    ownerField: 'address',
  }),
];

const address = [
  setAddress('address'),
  sanitizeAddress('address', { required: true, validate: true }),
];

const notifyParents = [
  {
    service: 'campaigns',
    parentField: 'ownerAddress',
    childField: 'address',
    watchFields: [ 'avatar', 'name' ],
  },
  {
    service: 'dacs',
    parentField: 'ownerAddress',
    childField: 'address',
    watchFields: [ 'avatar', 'name' ],
  },
];


// TODO write a hook to prevent overwriting a non-zero giverId with 0

module.exports = {
  before: {
    all: [],
    find: [ sanitizeAddress('address') ],
    get: [ normalizeId() ],
    create: [ commons.discard('_id'), ...address, createdAt ],
    update: [ ...restrict, commons.stashBefore(), updatedAt ],
    patch: [ ...restrict, commons.stashBefore(), updatedAt ],
    remove: [ commons.disallow() ],
  },

  after: {
    all: [
      commons.when(hook => hook.params.provider, commons.discard('_id')),
    ],
    find: [],
    get: [],
    create: [],
    update: [ notifyOfChange(...notifyParents) ],
    patch: [ notifyOfChange(...notifyParents) ],
    remove: [ notifyOfChange(...notifyParents) ],
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
