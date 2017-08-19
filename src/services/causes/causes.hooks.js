import { discard, setByDot } from 'feathers-hooks-common';
import { sanitizeAddress, validateAddress } from '../../hooks/address';
import { restrictToOwner } from 'feathers-authentication-hooks';

const restrict = [
  restrictToOwner({
    idField: 'address',
    ownerField: 'ownerAddress',
  }),
];

const setAddress = context => {
  setByDot(context.data, "ownerAddress", context.params.user.address);
  return context
};

const address = [
  discard("ownerAddress"),
  setAddress,
  sanitizeAddress("ownerAddress"),
  validateAddress("ownerAddress"),
];


module.exports = {
  before: {
    all: [],
    find: [],
    get: [],
    create: [ ...address ],
    update: [ ...restrict, ...address ],
    patch: [ ...restrict, ...address ],
    remove: [ ...restrict ],
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
