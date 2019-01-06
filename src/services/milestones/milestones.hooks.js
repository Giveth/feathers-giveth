const commons = require('feathers-hooks-common');
const errors = require('@feathersjs/errors');

const sanitizeAddress = require('../../hooks/sanitizeAddress');
const setAddress = require('../../hooks/setAddress');
const sanitizeHtml = require('../../hooks/sanitizeHtml');
const resolveFiles = require('../../hooks/resolveFiles');
const { isProjectAllowed } = require('../../hooks/isProjectAllowed');
const { isTokenAllowed } = require('../../hooks/isTokenAllowed');
const addConfirmations = require('../../hooks/addConfirmations');
const { MilestoneStatus } = require('../../models/milestones.model');
const getApprovedKeys = require('./getApprovedKeys');
const checkConversionRates = require('./checkConversionRates');
const sendNotification = require('./sendNotification');
const checkMilestoneDates = require('./checkMilestoneDates');

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
    {
      service: 'users',
      nameAs: 'campaignReviewer',
      parentField: 'campaignReviewerAddress',
      childField: 'address',
    },
    {
      service: 'users',
      nameAs: 'recipient',
      parentField: 'recipientAddress',
      childField: 'address',
    },
    {
      service: 'campaigns',
      nameAs: 'campaign',
      parentField: 'campaignId',
      childField: '_id',
    },
  ],
};

const getMilestones = context => {
  if (context.id) return context.service.get(context.id);
  if (!context.id && context.params.query) return context.service.find(context.params.query);
  return Promise.resolve();
};

const restrict = () => context => {
  // internal call are fine
  if (!context.params.provider) return context;

  const { data } = context;
  const { user } = context.params;

  if (!user) throw new errors.NotAuthenticated();

  const canUpdate = milestone => {
    if (!milestone) throw new errors.Forbidden();

    const approvedKeys = getApprovedKeys(milestone, data, user);

    // Remove the keys that are not allowed
    Object.keys(data).forEach(key => {
      if (!approvedKeys.includes(key)) delete data[key];
    });

    // Milestone is not yet on chain, check the ETH conversion
    if ([MilestoneStatus.PROPOSED, MilestoneStatus.REJECTED].includes(milestone.status)) {
      return checkConversionRates()(context);
    }
    // Milestone is on chain, remove data stored on-chain that can't be updated
    const keysToRemove = [
      'maxAmount',
      'reviewerAddress',
      'recipientAddress',
      'campaignReviewerAddress',
      'conversionRateTimestamp',
      'fiatAmount',
      'conversionRate',
      'selectedFiatType',
      'date',
      'token',
    ];
    keysToRemove.forEach(key => delete data[key]);

    if (data.items) {
      data.items = data.items.map(({ date, description, image }) =>
        Object.assign(
          {},
          {
            date,
            description,
            image,
          },
        ),
      );
    }

    // needed b/c we need to call checkConversionRates for proposed milestones
    // which is async
    return Promise.resolve();
  };

  return getMilestones(context).then(
    milestones =>
      Array.isArray(milestones)
        ? Promise.all(milestones.forEach(canUpdate))
        : canUpdate(milestones),
  );
};

const address = [
  sanitizeAddress('pluginAddress', { required: true, validate: true }),
  sanitizeAddress(['reviewerAddress', 'campaignReviewerAddress', 'recipientAddress'], {
    required: false,
    validate: true,
  }),
];

const canDelete = () => context => {
  const isDeletable = milestone => {
    if (!milestone) throw new errors.NotFound();

    if (![MilestoneStatus.PROPOSED, MilestoneStatus.REJECTED].includes(milestone.status)) {
      throw new errors.Forbidden('only proposed milestones can be removed');
    }
  };

  return getMilestones(context).then(milestones => {
    if (Array.isArray(milestones)) milestones.forEach(isDeletable);
    else isDeletable(milestones);
    return context;
  });
};

const storePrevState = () => context => {
  // do not update prevStatus when triggered by contract event
  // it has already been set
  if (context.data.status && !context.params.eventTxHash) {
    return getMilestones(context).then(milestone => {
      context.data.prevStatus = milestone.status;
      return context;
    });
  }

  return context;
};

/**
 * Capture the address of the user who patched (= performed action on) the milestone
 * */
const performedBy = () => context => {
  // do not process internal calls as they have no user
  if (!context.params.provider) return context;

  context.params.performedByAddress = context.params.user.address;
  return context;
};

module.exports = {
  before: {
    all: [],
    find: [
      sanitizeAddress([
        'ownerAddress',
        'pluginAddress',
        'reviewerAddress',
        'campaignReviewerAddress',
        'recipientAddress',
      ]),
    ],
    get: [],
    create: [
      checkConversionRates(),
      checkMilestoneDates(),
      setAddress('ownerAddress'),
      ...address,
      isProjectAllowed(),
      isTokenAllowed(),
      sanitizeHtml('description'),
    ],
    update: [restrict(), checkMilestoneDates(), ...address, sanitizeHtml('description')],
    patch: [
      restrict(),
      sanitizeAddress(
        ['pluginAddress', 'reviewerAddress', 'campaignReviewerAddress', 'recipientAddress'],
        { validate: true },
      ),
      sanitizeHtml('description'),
      storePrevState(),
      performedBy(),
    ],
    remove: [canDelete()],
  },

  after: {
    all: [commons.populate({ schema })],
    find: [addConfirmations(), resolveFiles('image')],
    get: [addConfirmations(), resolveFiles('image')],
    create: [sendNotification(), resolveFiles('image')],
    update: [resolveFiles('image')],
    patch: [sendNotification(), resolveFiles('image')],
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
