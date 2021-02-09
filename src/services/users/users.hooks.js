const commons = require('feathers-hooks-common');
const { toChecksumAddress } = require('web3-utils');
const errors = require('@feathersjs/errors');

const notifyOfChange = require('../../hooks/notifyOfChange');
const sanitizeAddress = require('../../hooks/sanitizeAddress');
const setAddress = require('../../hooks/setAddress');
const fundWallet = require('../../hooks/fundWallet');
const resolveFiles = require('../../hooks/resolveFiles');
const { isUserAdmin } = require('../../utils/roleUtility');
const { isRequestInternal } = require('../../utils/feathersUtils');

const normalizeId = () => context => {
  if (context.id) {
    context.id = toChecksumAddress(context.id);
  }
  return context;
};
const roleAccessKeys = ['isReviewer', 'isProjectOwner', 'isDelegator'];

const restrictUserdataAndAccess = () => context => {
  if (isRequestInternal(context)) {
    return context;
  }
  const { user } = context.params;
  const { data } = context;
  const sentUserAddress = context.id;
  if (isUserAdmin(user.address) && user.address === sentUserAddress) {
    return context;
  }
  if (!isUserAdmin(user.address) && user.address === sentUserAddress) {
    roleAccessKeys.forEach(key => {
      delete data[key];
    });
    return context;
  }
  if (isUserAdmin(user.address) && user.address !== sentUserAddress) {
    Object.keys(data).forEach(key => {
      if (!roleAccessKeys.includes(key)) {
        delete data[key];
      }
    });

    return context;
  }
  // when user is not admin and the sent user and the token user is not the same
  throw new errors.Forbidden();
};

const restrict = [
  normalizeId(),
  // restrictToOwner({
  //   idField: 'address',
  //   ownerField: 'address',
  // }),
  restrictUserdataAndAccess(),
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
    watchFields: ['avatar', 'name'],
  },
  {
    service: 'dacs',
    parentField: 'ownerAddress',
    childField: 'address',
    watchFields: ['avatar', 'name'],
  },
];

// TODO write a hook to prevent overwriting a non-zero giverId with 0

module.exports = {
  before: {
    all: [commons.discardQuery('$disableStashBefore')],
    find: [sanitizeAddress('address')],
    get: [normalizeId()],
    create: [commons.discard('_id'), ...address],
    update: [...restrict, commons.stashBefore()],
    patch: [...restrict, commons.stashBefore()],
    remove: [commons.disallow()],
  },

  after: {
    all: [commons.discard('_id')],
    find: [resolveFiles('avatar')],
    get: [resolveFiles('avatar')],
    create: [fundWallet(), resolveFiles('avatar')],
    update: [resolveFiles('avatar'), notifyOfChange(...notifyParents)],
    patch: [resolveFiles('avatar'), notifyOfChange(...notifyParents)],
    remove: [notifyOfChange(...notifyParents)],
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
