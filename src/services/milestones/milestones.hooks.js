const commons = require('feathers-hooks-common');
const BatchLoader = require('@feathers-plus/batch-loader');
const errors = require('@feathersjs/errors');
const logger = require('winston');

const { getResultsByKey, getUniqueKeys } = BatchLoader;

const sanitizeAddress = require('../../hooks/sanitizeAddress');
const setAddress = require('../../hooks/setAddress');
const sanitizeHtml = require('../../hooks/sanitizeHtml');
const tokenAddressConversion = require('../../hooks/tokenAddressConversion');
const resolveFiles = require('../../hooks/resolveFiles');
const { isProjectAllowed } = require('../../hooks/isProjectAllowed');
const { isTokenAllowed } = require('../../hooks/isTokenAllowed');
const addConfirmations = require('../../hooks/addConfirmations');
const { MilestoneStatus } = require('../../models/milestones.model');
const getApprovedKeys = require('./getApprovedKeys');
const checkConversionRates = require('./checkConversionRates');
const sendNotification = require('./sendNotification');
const checkMilestoneDates = require('./checkMilestoneDates');
const { getBlockTimestamp, ZERO_ADDRESS } = require('../../blockchain/lib/web3Helpers');
const { getTokenByAddress } = require('../../utils/tokenHelper');

const milestoneResolvers = {
  before: context => {
    context._loaders = {
      user: {
        address: new BatchLoader(
          async (keys, context2) => {
            const result = await context.app.service('users').find(
              commons.makeCallingParams(
                context2,
                { address: { $in: getUniqueKeys(keys) } },
                undefined,
                {
                  paginate: false,
                },
              ),
            );
            return getResultsByKey(keys, result, user => user.address, '');
          },
          { context },
        ),
      },

      campaign: {
        id: new BatchLoader(
          async (keys, context2) => {
            const result = await context.app.service('campaigns').find(
              commons.makeCallingParams(
                context2,
                { _id: { $in: getUniqueKeys(keys) } },
                undefined,
                {
                  paginate: false,
                },
              ),
            );
            return getResultsByKey(keys, result, campaign => campaign._id, '!');
          },
          { context },
        ),
        projectId: new BatchLoader(
          async (keys, context2) => {
            const result = await context.app.service('campaigns').find(
              commons.makeCallingParams(
                context2,
                { projectId: { $in: getUniqueKeys(keys) } },
                undefined,
                {
                  paginate: false,
                },
              ),
            );
            return getResultsByKey(keys, result, campaign => campaign.projectId, '!');
          },
          { context },
        ),
      },
    };
  },
  joins: {
    owner: () => async (milestone, context) => {
      if (!milestone.ownerAddress) return;
      // eslint-disable-next-line no-param-reassign
      milestone.owner = await context._loaders.user.address.load(milestone.ownerAddress);
    },

    reviewer: () => async (milestone, context) => {
      const { reviewerAddress } = milestone;
      if (!reviewerAddress || reviewerAddress === ZERO_ADDRESS) return;
      // eslint-disable-next-line no-param-reassign
      milestone.reviewer = await context._loaders.user.address.load(reviewerAddress);
    },

    campaignReviewer: () => async (milestone, context) => {
      const { campaignReviewerAddress } = milestone;
      if (!campaignReviewerAddress || campaignReviewerAddress === ZERO_ADDRESS) {
        return;
      }

      // eslint-disable-next-line no-param-reassign
      milestone.campaignReviewer = await context._loaders.user.address.load(
        campaignReviewerAddress,
      );
    },

    recipient: () => async (milestone, context) => {
      const { recipientId, recipientAddress } = milestone;
      if ((!recipientAddress || recipientAddress === ZERO_ADDRESS) && !recipientId) return;
      if (recipientId) {
        // TODO: join recipientId
        // currently the UI only supports the parent campaign. If we ever support more options,
        // then we will need to query pledgeAdmins first to fetch the typeId & type, then query
        // for the correct entity
        // eslint-disable-next-line no-param-reassign
        milestone.recipient = await context._loaders.campaign.projectId.load(recipientId);
      } else {
        // eslint-disable-next-line no-param-reassign
        milestone.recipient = await context._loaders.user.address.load(recipientAddress);
      }
    },

    pendingRecipient: () => async (milestone, context) => {
      const { pendingRecipientAddress } = milestone;
      if (pendingRecipientAddress && pendingRecipientAddress !== ZERO_ADDRESS) {
        // eslint-disable-next-line no-param-reassign
        milestone.pendingRecipient = await context._loaders.user.address.load(
          pendingRecipientAddress,
        );
      }
    },

    campaign: () => async (milestone, context) => {
      const { campaignId } = milestone;
      if (!campaignId) return;
      // eslint-disable-next-line no-param-reassign
      milestone.campaign = await context._loaders.campaign.id.load(campaignId);
    },

    token: () => async (milestone, _context) => {
      const { tokenAddress } = milestone;
      const token = getTokenByAddress(tokenAddress);
      if (token) {
        milestone.token = token;
      }
    },
  },
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
      'dacId',
      'recipientAddress',
      'campaignReviewerAddress',
      'conversionRateTimestamp',
      'fiatAmount',
      'conversionRate',
      'selectedFiatType',
      'date',
      'token',
      'tokenAddress',
      'type',
    ];
    keysToRemove.forEach(key => delete data[key]);

    if (data.items) {
      data.items = data.items.map(({ date, description, image }) => ({
        date,
        description,
        image,
      }));
    }

    // needed b/c we need to call checkConversionRates for proposed milestones
    // which is async
    return Promise.resolve();
  };

  return getMilestones(context).then(milestones =>
    Array.isArray(milestones) ? Promise.all(milestones.forEach(canUpdate)) : canUpdate(milestones),
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
  // TODO every one can delete any Proposed and Rejected milestones
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
  const { params, data } = context;
  if (data.status && !params.eventTxHash) {
    return getMilestones(context).then(milestone => {
      data.prevStatus = milestone.status;
      return context;
    });
  }

  return context;
};

const convertTokenToTokenAddress = () => context => {
  const { data } = context;
  if (data.token) {
    data.tokenAddress = data.token.address;
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

/**
 * If a on-chain event has occured, update the parent campaign's
 * updatedAt prop to the tx ts. This is done so that campaigns can be
 * sorted by recent updates, allowing stale campaigns to fall off
 */
const updateCampaign = () => context => {
  commons.checkContext(context, 'after', ['create', 'patch', 'update']);

  // update the parent campaign updatedAt time when a contract event
  // is triggered
  if (context.params.eventTxHash) {
    // update parent campaign asynchrounsly

    // query event db to get the blockNumber
    context.app
      .service('events')
      .find({
        query: {
          transactionHash: context.params.eventTxHash,
          $limit: 1,
        },
        paginate: false,
      })
      // event should always exist b/c params.eventTxHash is only
      // added to context when processing events
      .then(events => getBlockTimestamp(context.app.getWeb3(), events[0].blockNumber))
      .then(ts =>
        context.app.service('campaigns').patch(
          null,
          { updatedAt: ts },
          {
            query: {
              _id: context.result.campaignId,
              updatedAt: { $lt: ts },
            },
          },
        ),
      )
      .catch(err => logger.warn(err));
  }
  return context;
};

module.exports = {
  before: {
    all: [tokenAddressConversion()],
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
      convertTokenToTokenAddress(),
    ],
    update: [
      restrict(),
      checkMilestoneDates(),
      ...address,
      sanitizeHtml('description'),
      convertTokenToTokenAddress(),
    ],
    patch: [
      restrict(),
      sanitizeAddress(
        ['pluginAddress', 'reviewerAddress', 'campaignReviewerAddress', 'recipientAddress'],
        { validate: true },
      ),
      sanitizeHtml('description'),
      storePrevState(),
      performedBy(),
      convertTokenToTokenAddress(),
    ],
    remove: [canDelete()],
  },

  after: {
    all: [commons.fastJoin(milestoneResolvers)],
    find: [addConfirmations(), resolveFiles(['image', 'items'])],
    get: [addConfirmations(), resolveFiles(['image', 'items'])],
    create: [sendNotification(), resolveFiles(['image', 'items']), updateCampaign()],
    update: [resolveFiles('image'), updateCampaign()],
    patch: [sendNotification(), resolveFiles(['image', 'items']), updateCampaign()],
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
