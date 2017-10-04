import commons from 'feathers-hooks-common';
import { restrictToOwner } from 'feathers-authentication-hooks';

import sanitizeAddress from '../../hooks/sanitizeAddress';
import setAddress from '../../hooks/setAddress';
import sanitizeHtml from '../../hooks/sanitizeHtml';

const restrict = [
  restrictToOwner({
    idField: 'address',
    ownerField: 'ownerAddress',
  }),
];

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
    .then(results => commons.replaceItems(context, results));
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
