const commons = require('feathers-hooks-common');
const errors = require('@feathersjs/errors');

const sanitizeAddress = require('../../hooks/sanitizeAddress');
const setAddress = require('../../hooks/setAddress');
const sanitizeHtml = require('../../hooks/sanitizeHtml');
const isProjectAllowed = require('../../hooks/isProjectAllowed');
const addConfirmations = require('../../hooks/addConfirmations');
const { CampaignStatus } = require('../../models/campaigns.model');

const restrict = () => context => {
  // internal call are fine
  if (!context.params.provider) return context;

  const { data, service } = context;
  const user = context.params.user;

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
      const approvedKeys = ['txHash', 'status', 'mined'];

      const keysToRemove = Object.keys(data).map(key => !approvedKeys.includes(key));
      keysToRemove.forEach(key => delete data[key]);
    } else if (user.address !== campaign.ownerAddress) throw new errors.Forbidden();
  };

  return getCampaigns().then(
    campaigns => (Array.isArray(campaigns) ? campaigns.forEach(canUpdate) : canUpdate(campaigns)),
  );
};

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
const countMilestones = (item, service) =>
  service
    .find({
      query: {
        campaignId: item._id,
        projectId: {
          $gt: 0, // 0 is a pending milestone
        },
        $limit: 0,
      },
    })
    .then(count => Object.assign(item, { milestonesCount: count.total }));

// add milestonesCount to each DAC object
const addMilestoneCounts = () => context => {
  const service = context.app.service('milestones');

  const items = commons.getItems(context);

  let promises;
  if (Array.isArray(items)) {
    promises = items.map(item => countMilestones(item, service));
  } else {
    promises = [countMilestones(items, service)];
  }

  return Promise.all(promises).then(
    results =>
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
      setAddress('ownerAddress'),
      sanitizeAddress('ownerAddress', {
        required: true,
        validate: true,
      }),
      isProjectAllowed(),
      sanitizeHtml('description'),
    ],
    update: [
      restrict(),
      sanitizeAddress('ownerAddress', { required: true, validate: true }),
      sanitizeHtml('description'),
    ],
    patch: [
      restrict(),
      sanitizeAddress('ownerAddress', { validate: true }),
      sanitizeHtml('description'),
    ],
    remove: [commons.disallow()],
  },

  after: {
    all: [commons.populate({ schema })],
    find: [addMilestoneCounts(), addConfirmations()],
    get: [addMilestoneCounts(), addConfirmations()],
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
