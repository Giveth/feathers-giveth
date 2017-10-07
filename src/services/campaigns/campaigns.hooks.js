import commons from 'feathers-hooks-common';
import errors from 'feathers-errors';

import sanitizeAddress from '../../hooks/sanitizeAddress';
import setAddress from '../../hooks/setAddress';
import sanitizeHtml from '../../hooks/sanitizeHtml';

const restrict = () => context => {
  // internal call are fine
  if (!context.params.provider) return context;

  const { data, service } = context;
  const user = context.params.user;

  if (!user) throw new errors.NotAuthenticated();

  const items = commons.getItems(context);

  const getCampaigns = () => {
    if (context.id) return service.get(context.id);
    if (!context.id && context.params.query) return service.find(context.params.query);
    return undefined;
  };

  const canUpdate = (campaign) => {
    if (!campaign) throw new errors.Forbidden();

    // reviewer can mark Completed or Canceled
    if (data.status === 'Canceled' && data.mined === false) {
      if (!user.address === campaign.reviewerAddress) throw new errors.Forbidden('Only the reviewer accept or cancel a campaign');

      // whitelist of what the reviewer can update
      const approvedKeys = ['txHash', 'status', 'mined'];

      const keysToRemove = Object.keys(data).map(key => !approvedKeys.includes(key));
      keysToRemove.forEach(key => delete data[ key ]);

    } else if (!user.address === campaign.ownerAddress) throw new errors.Forbidden();
  };

  if (Array.isArray(items)) {
    return getCampaigns()
      .then(campaigns => {
        return (Array.isArray(campaigns)) ? campaigns.forEach(canUpdate) : canUpdate(campaigns);
      });
  }
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
const countMilestones = (item, service) => {
  return service.find({
    query: {
      campaignId: item._id,
      projectId: {
        $gt: '0' // 0 is a pending milestone
      },
      $limit: 0
    }
  }).then(count => Object.assign(item, { milestonesCount: count.total }));
};

// add milestonesCount to each DAC object
const addMilestoneCounts = () => (context) => {
  const service = context.app.service('milestones');

  const items = commons.getItems(context);

  let promises;
  if (Array.isArray(items)) {
    promises = items.map(item => countMilestones(item, service));
  } else {
    promises = [ countMilestones(items, service) ];
  }

  return Promise.all(promises)
    .then(results => (results.length === 1) ? commons.replaceItems(context, results[ 0 ]) : commons.replaceItems(context, results));
};

module.exports = {
  before: {
    all: [],
    find: [ sanitizeAddress('ownerAddress') ],
    get: [],
    create: [ setAddress('ownerAddress'), sanitizeAddress('ownerAddress', {
      required: true,
      validate: true,
    }), sanitizeHtml('description') ],
    update: [ ...restrict, sanitizeAddress('ownerAddress', { required: true, validate: true }), sanitizeHtml('description') ],
    patch: [ ...restrict, sanitizeAddress('ownerAddress', { validate: true }), sanitizeHtml('description') ],
    remove: [ sanitizeAddress('ownerAddress'), ...restrict ],
  },

  after: {
    all: [ commons.populate({ schema }) ],
    find: [ addMilestoneCounts() ],
    get: [ addMilestoneCounts() ],
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
