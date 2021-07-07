const commons = require('feathers-hooks-common');
const errors = require('@feathersjs/errors');

const sanitizeAddress = require('../../hooks/sanitizeAddress');
const setAddress = require('../../hooks/setAddress');
const sanitizeHtml = require('../../hooks/sanitizeHtml');
const resolveFiles = require('../../hooks/resolveFiles');
const { checkReviewer, checkOwner } = require('../../hooks/isProjectAllowed');
const addConfirmations = require('../../hooks/addConfirmations');
const { CampaignStatus } = require('../../models/campaigns.model');
const createModelSlug = require('../createModelSlug');
const { isRequestInternal } = require('../../utils/feathersUtils');
const {
  sendCampaignCancelledEvent,
  sendCampaignCreatedEvent,
  viewEntitiesPage,
  viewEntityDetailPage,
} = require('../../utils/analyticsUtils');

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
  ],
};

/**
 * restrict who can patch the campaign
 */
const restrict = () => context => {
  // internal call are fine
  if (!context.params.provider) return context;

  const { data, service } = context;
  const { user } = context.params;

  if (!user) throw new errors.NotAuthenticated();

  const getCampaigns = () => {
    if (context.id) return service.get(context.id);
    if (!context.id && context.params.query) return service.find(context.params.query);
    return undefined;
  };

  const canUpdate = campaign => {
    if (!campaign) throw new errors.Forbidden();

    // reviewer Canceled
    if (data.status === CampaignStatus.CANCELED && data.mined === false) {
      if (user.address !== campaign.reviewerAddress && user.address !== campaign.ownerAddress)
        throw new errors.Forbidden();

      // whitelist of what the reviewer can update
      const approvedKeys = ['status', 'mined'];

      const keysToRemove = Object.keys(data).map(key => !approvedKeys.includes(key));
      keysToRemove.forEach(key => delete data[key]);
    } else if (campaign.ownerAddress && user.address !== campaign.ownerAddress)
      throw new errors.Forbidden();

    // never allow setting txHash in an update/patch
    commons.deleteByDot(data, 'txHash');
  };

  return getCampaigns().then(campaigns =>
    Array.isArray(campaigns) ? campaigns.forEach(canUpdate) : canUpdate(campaigns),
  );
};

const removeProtectedFields = () => context => {
  if (context && context.data && !isRequestInternal(context)) {
    delete context.data.verified;
  }
  return context;
};

const countTraces = (item, service) =>
  service.Model.countDocuments({
    campaignId: item._id,
    projectId: {
      $gt: 0, // 0 is a pending milestone
    },
  }).then(count => Object.assign(item, { milestonesCount: count }));

// add milestonesCount to each COMMUNITY object
const addTraceCounts = () => context => {
  const service = context.app.service('traces');

  const items = commons.getItems(context);

  let promises;
  if (Array.isArray(items)) {
    promises = items.map(item => countTraces(item, service));
  } else {
    promises = [countTraces(items, service)];
  }

  return Promise.all(promises).then(results =>
    Array.isArray(items)
      ? commons.replaceItems(context, results)
      : commons.replaceItems(context, results[0]),
  );
};

const sendAnalyticsData = () => context => {
  if (
    !isRequestInternal(context) &&
    context.method === 'patch' &&
    context.data.status === CampaignStatus.CANCELED
  ) {
    sendCampaignCancelledEvent({
      context,
      campaign: context.result,
    });
  }
  if (!isRequestInternal(context) && context.method === 'create') {
    sendCampaignCreatedEvent({
      context,
      campaign: context.result,
    });
  }
  return context;
};
const sendPageViewAnalytics = () => context => {
  if (
    !isRequestInternal(context) &&
    context.params.query &&
    context.params.query.status === CampaignStatus.ACTIVE &&
    context.params.query.$limit === 20
  ) {
    viewEntitiesPage({
      context,
      query: context.params.query,
      entity: 'campaign',
    });
  } else if (
    !isRequestInternal(context) &&
    context.params.query &&
    context.params.query.slug &&
    context.params.query.$limit === undefined
  ) {
    viewEntityDetailPage({
      context,
      query: context.params.query,
      entity: 'campaign',
    });
  }
  return context;
};

module.exports = {
  before: {
    all: [],
    find: [sendPageViewAnalytics(), sanitizeAddress('ownerAddress')],
    get: [],
    create: [
      removeProtectedFields(),
      setAddress('coownerAddress'),
      sanitizeAddress('coownerAddress', {
        required: true,
        validate: true,
      }),
      setAddress('ownerAddress'),
      sanitizeAddress('ownerAddress', {
        required: true,
        validate: true,
      }),
      checkReviewer(),
      checkOwner(),
      sanitizeHtml('description'),
      createModelSlug('campaigns'),
    ],
    update: [commons.disallow()],
    patch: [
      removeProtectedFields(),
      restrict(),
      sanitizeAddress('ownerAddress', { validate: true }),
      sanitizeHtml('description'),
      createModelSlug('campaigns'),
    ],
    remove: [commons.disallow()],
  },

  after: {
    all: [commons.populate({ schema })],
    find: [addTraceCounts(), addConfirmations(), resolveFiles('image')],
    get: [addTraceCounts(), addConfirmations(), resolveFiles('image')],
    create: [resolveFiles('image'), sendAnalyticsData()],
    update: [resolveFiles('image')],
    patch: [resolveFiles('image'), sendAnalyticsData()],
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
