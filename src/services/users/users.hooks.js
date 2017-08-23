import { when, discard, getByDot, setByDot, disallow } from 'feathers-hooks-common';
import { sanitizeAddress, validateAddress } from '../../hooks/address';
import { restrictToOwner } from 'feathers-authentication-hooks';
import { toChecksumAddress } from 'web3-utils';

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
  const addr = getByDot(data, field);
  if (addr) {
    setByDot(data, field, addr.toLowerCase());
  }
  return data;
};

const setAddress = context => {
  setByDot(context.data, 'address', context.params.user.address);
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

module.exports = {
  before: {
    all: [],
    find: [ normalizeQueryAddress() ],
    get: [ normalizeId() ],
    create: [ discard('_id'), ...address ],
    update: [ ...restrict ],
    patch: [ ...restrict ],
    remove: [ disallow() ],
  },

  after: {
    all: [
      when(
        hook => hook.params.provider,
        discard('_id'),
        checksumAddress(),
      ),
    ],
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
