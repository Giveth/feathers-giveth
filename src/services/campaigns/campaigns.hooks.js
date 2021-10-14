const commons = require('feathers-hooks-common');
const errors = require('@feathersjs/errors');
const config = require('config');

const { rateLimit } = require('../../utils/rateLimit');
const sanitizeAddress = require('../../hooks/sanitizeAddress');
const setAddress = require('../../hooks/setAddress');
const sanitizeHtml = require('../../hooks/sanitizeHtml');
const resolveFiles = require('../../hooks/resolveFiles');
const { checkReviewer, checkCampaignOwner } = require('../../hooks/isProjectAllowed');
const addConfirmations = require('../../hooks/addConfirmations');
const { CampaignStatus } = require('../../models/campaigns.model');
const createModelSlug = require('../createModelSlug');
const { isRequestInternal } = require('../../utils/feathersUtils');
const { errorMessages } = require('../../utils/errorMessages');

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

    if (campaign.status === CampaignStatus.ARCHIVED) {
      if (!user.isAdmin) {
        throw new errors.Forbidden(errorMessages.JUST_ADMINS_CAN_UN_ARCHIVE_CAMPAIGN);
      }
      if (data.status !== CampaignStatus.ACTIVE) {
        throw new errors.BadRequest(
          errorMessages.ARCHIVED_CAMPAIGNS_STATUS_JUST_CAN_UPDATE_TO_ACTIVE,
        );
      }
      // when unArchiving campaign, user just can set status not any other field
      Object.keys(data).forEach(key => {
        if (key !== 'status') {
          delete data[key];
        }
      });
      return;
    }
    if (data.status === CampaignStatus.ARCHIVED) {
      if (user.address !== campaign.ownerAddress && !user.isAdmin) {
        throw new errors.Forbidden(
          errorMessages.JUST_CAMPAIGN_OWNER_AND_ADMIN_CAN_ARCHIVE_CAMPAIGN,
        );
      }
      if (campaign.status !== CampaignStatus.ACTIVE) {
        throw new errors.BadRequest(errorMessages.JUST_ACTIVE_CAMPAIGNS_COULD_BE_ARCHIVED);
      }
      // when archiving campaign, user jus can status not any other field
      Object.keys(data).forEach(key => {
        if (key !== 'status') {
          delete data[key];
        }
      });
      return;
    }

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

const removeStatusFromRequestDataBeforeCreating = () => context => {
  if (context && context.data && !isRequestInternal(context)) {
    // prevent user to create non Pending status
    delete context.data.status;
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

module.exports = {
  before: {
    all: [],
    find: [sanitizeAddress('ownerAddress')],
    get: [],
    create: [
      removeProtectedFields(),
      removeStatusFromRequestDataBeforeCreating(),
      // setAddress('coownerAddress'),
      sanitizeAddress('coownerAddress', {
        required: false,
        validate: true,
      }),
      setAddress('ownerAddress'),
      sanitizeAddress('ownerAddress', {
        required: true,
        validate: true,
      }),
      checkReviewer(),
      checkCampaignOwner(),
      sanitizeHtml('description'),
      createModelSlug('campaigns'),

      // We dont count failed requests so I put it in last before hook
      rateLimit({
        threshold: config.rateLimit.createProjectThreshold,
        ttl: config.rateLimit.createProjectTtlSeconds,
      }),
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
