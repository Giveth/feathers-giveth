const commons = require('feathers-hooks-common');
const errors = require('@feathersjs/errors');
const { restrictToOwner } = require('feathers-authentication-hooks');
const config = require('config');

const { rateLimit } = require('../../utils/rateLimit');
const sanitizeAddress = require('../../hooks/sanitizeAddress');
const setAddress = require('../../hooks/setAddress');
const sanitizeHtml = require('../../hooks/sanitizeHtml');
const addConfirmations = require('../../hooks/addConfirmations');
const resolveFiles = require('../../hooks/resolveFiles');
const createModelSlug = require('../createModelSlug');
const { isUserInDelegateWhiteList } = require('../../utils/roleUtility');
const { isRequestInternal } = require('../../utils/feathersUtils');

const restrict = [
  context => commons.deleteByDot(context.data, 'txHash'),
  restrictToOwner({
    idField: 'address',
    ownerField: 'ownerAddress',
  }),
];

const removeProtectedFields = () => context => {
  if (context && context.data && !isRequestInternal(context)) {
    delete context.data.verified;
  }
  return context;
};

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

const countCampaigns = (item, service) =>
  service.Model.countDocuments({
    communities: item._id,
    projectId: {
      $gt: 0, // 0 is a pending campaign
    },
  }).then(count => Object.assign(item, { campaignsCount: count }));

// add campaignCount to each COMMUNITY object
const addCampaignCounts = () => context => {
  const service = context.app.service('campaigns');

  const items = commons.getItems(context);

  let promises;
  if (Array.isArray(items)) {
    promises = items.map(item => countCampaigns(item, service));
  } else {
    promises = [countCampaigns(items, service)];
  }

  return Promise.all(promises).then(results =>
    Array.isArray(items)
      ? commons.replaceItems(context, results)
      : commons.replaceItems(context, results[0]),
  );
};

const isDacAllowed = () => context => {
  if (!context.app.get('useDelegateWhitelist')) {
    return context;
  }

  const items = commons.getItems(context);

  const inWhitelist = async community => {
    if (await isUserInDelegateWhiteList(context.app, community.ownerAddress.toLowerCase())) {
      return;
    }

    throw new errors.BadRequest(
      `community ownerAddress ${community.ownerAddress} is not in the whitelist`,
    );
  };

  if (Array.isArray(items)) {
    items.forEach(inWhitelist);
  } else {
    inWhitelist(items);
  }
  return context;
};

module.exports = {
  before: {
    all: [],
    find: [sanitizeAddress('ownerAddress')],
    get: [],
    create: [
      removeProtectedFields(),
      setAddress('ownerAddress'),
      isDacAllowed(),
      sanitizeAddress('ownerAddress', { required: true, validate: true }),
      sanitizeHtml('description'),
      createModelSlug('communities'),

      // We dont count failed requests so I put it in last before hook
      rateLimit({
        threshold: config.rateLimit.createProjectThreshold,
        ttl: config.rateLimit.createProjectTtlSeconds,
      }),
    ],
    update: [commons.disallow()],
    patch: [
      removeProtectedFields(),
      ...restrict,
      sanitizeAddress('ownerAddress', { validate: true }),
      sanitizeHtml('description'),
      createModelSlug('communities'),
    ],
    remove: [commons.disallow()],
  },

  after: {
    all: [commons.populate({ schema })],
    find: [addCampaignCounts(), addConfirmations(), resolveFiles('image')],
    get: [addCampaignCounts(), addConfirmations(), resolveFiles('image')],
    create: [resolveFiles('image')],
    update: [resolveFiles('image')],
    patch: [resolveFiles('image')],
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
