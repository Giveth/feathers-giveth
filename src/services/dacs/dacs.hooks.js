const commons = require('feathers-hooks-common');
const errors = require('@feathersjs/errors');
const { restrictToOwner } = require('feathers-authentication-hooks');
const sanitizeAddress = require('../../hooks/sanitizeAddress');
const setAddress = require('../../hooks/setAddress');
const sanitizeHtml = require('../../hooks/sanitizeHtml');
const addConfirmations = require('../../hooks/addConfirmations');

const logger = require('winston');

const restrict = [
  context => commons.deleteByDot(context.data, 'txHash'),
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

const countCampaigns = (item, service) =>
  service
    .find({
      query: {
        dacs: item._id,
        projectId: {
          $gt: 0, // 0 is a pending campaign
        },
        $limit: 0,
      },
    })
    .then(count => Object.assign(item, { campaignsCount: count.total }));

// add campaignCount to each DAC object
const addCampaignCounts = () => context => {
  const service = context.app.service('campaigns');

  const items = commons.getItems(context);

  let promises;
  if (Array.isArray(items)) {
    promises = items.map(item => countCampaigns(item, service));
  } else {
    promises = [countCampaigns(items, service)];
  }

  return Promise.all(promises).then(
    results =>
      Array.isArray(items)
        ? commons.replaceItems(context, results)
        : commons.replaceItems(context, results[0]),
  );
};

const isDacAllowed = () => context => {
  if (!context.app.get('useDelegateWhitelist')) {
    return context;
  }

  const delegateWhitelist = context.app.get('delegateWhitelist').map(addr => addr.toLowerCase());

  const items = commons.getItems(context);

  const inWhitelist = dac => {
    if (delegateWhitelist.includes(dac.ownerAddress.toLowerCase())) {
      return;
    }

    throw new errors.BadRequest(`dac ownerAddress ${dac.ownerAddress} is not in the whitelist`);
  };

  if (Array.isArray(items)) {
    items.forEach(inWhitelist);
  } else {
    inWhitelist(items);
  }
};

const addTransaction = () => async context => {
  const transactions = context.app.service('transactions');

  console.log(JSON.stringify(context, null, 2), 'context');
  logger.error('next to transactions.  create');

  await transactions.create({
    id:'stringid',
    userAction: 'Create',
    userRole: 'Manager',
    projectType: 'Campaign',
    blockHash: 'string',
    blockNumber: 1111,
    address: context.data.ownerAddress,
    txHash: context.data.txHash,
    title: context.data.title,
  });
};


module.exports = {
  before: {
    all: [],
    find: [sanitizeAddress('ownerAddress')],
    get: [],
    create: [
      setAddress('ownerAddress'),
      isDacAllowed(),
      sanitizeAddress('ownerAddress', { required: true, validate: true }),
      sanitizeHtml('description'),
    ],
    update: [commons.disallow()],
    patch: [
      ...restrict,
      sanitizeAddress('ownerAddress', { validate: true }),
      sanitizeHtml('description'),
    ],
    remove: [commons.disallow()],
  },

  after: {
    all: [commons.populate({ schema })],
    find: [addCampaignCounts(), addConfirmations()],
    get: [addCampaignCounts(), addConfirmations()],
    create: [addTransaction()],
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
