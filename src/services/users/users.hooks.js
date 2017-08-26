import commons from 'feathers-hooks-common';
import { sanitizeAddress, validateAddress } from '../../hooks/address';
import { restrictToOwner } from 'feathers-authentication-hooks';
import { toChecksumAddress } from 'web3-utils';
import notifyOfChange from "../../hooks/notifyOfChange";

const normalizeId = () => {
  return context => {
    context.id = context.id.toLowerCase();
    return context;
  };
};

const normalizeAddress = () => {
  return context => {
    context.data = normalize(context.data, 'address');
    return context;
  };
};

const normalizeQueryAddress = () => {
  return context => {
    if (context.params.query) {
      context.params.query = normalize(context.params.query, 'address');
    }
    return context;
  };
};

const normalize = (data, field) => {
  const addr = commons.getByDot(data, field);
  if (addr) {
    commons.setByDot(data, field, addr.toLowerCase());
  }
  return data;
};

const setAddress = context => {
  commons.setByDot(context.data, 'address', context.params.user.address);
  return context;
};

const checksumAddress = () => {
  return context => {
    if (context.result.data) {
      context.result.data = context.result.data.map(user => {
        user.address = toChecksumAddress(user.address);
        return user;
      });
    } else if (context.result) {
      if (Array.isArray(context.result)) {
        context.result = context.result.map(user => {
          user.address = toChecksumAddress(user.address);
          return user;
        });

      } else {
        context.result.address = toChecksumAddress(context.result.address);
      }
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
  setAddress,
  sanitizeAddress('address'),
  validateAddress('address'),
  normalizeAddress(),
];

const notifyParents = [
  {
    service: 'campaigns',
    parentField: 'ownerAddress',
    childField: 'address',
    watchFields: [ 'avatar', 'name' ],
  },
  {
    service: 'causes',
    parentField: 'ownerAddress',
    childField: 'address',
    watchFields: [ 'avatar', 'name' ],
  },
];

module.exports = {
  before: {
    all: [],
    find: [ normalizeQueryAddress() ],
    get: [ normalizeId() ],
    create: [ commons.discard('_id'), ...address ],
    update: [ ...restrict, commons.stashBefore() ],
    patch: [ ...restrict, commons.stashBefore() ],
    remove: [ commons.disallow() ],
  },

  after: {
    all: [
      commons.when(hook => hook.params.provider, commons.discard('_id'), checksumAddress()),
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
