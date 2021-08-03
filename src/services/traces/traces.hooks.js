const commons = require('feathers-hooks-common');
const BatchLoader = require('@feathers-plus/batch-loader');
const errors = require('@feathersjs/errors');
const logger = require('winston');
const { restrictToOwner } = require('feathers-authentication-hooks');

const { getResultsByKey, getUniqueKeys } = BatchLoader;

const sanitizeAddress = require('../../hooks/sanitizeAddress');
const setAddress = require('../../hooks/setAddress');
const sanitizeHtml = require('../../hooks/sanitizeHtml');
const tokenAddressConversion = require('../../hooks/tokenAddressConversion');
const resolveFiles = require('../../hooks/resolveFiles');
const { isTraceAllowed } = require('../../hooks/isProjectAllowed');
const { isTokenAllowed } = require('../../hooks/isTokenAllowed');
const addConfirmations = require('../../hooks/addConfirmations');
const { TraceStatus } = require('../../models/traces.model');
const getApprovedKeys = require('./getApprovedKeys');
const checkConversionRates = require('./checkConversionRates');
const { handleTraceConversationAndEmail } = require('../../utils/conversationAndEmailHandler');
const checkTraceDates = require('./checkTraceDates');
const checkTraceName = require('./checkTraceName');
const { getBlockTimestamp, ZERO_ADDRESS } = require('../../blockchain/lib/web3Helpers');
const { getTokenByAddress } = require('../../utils/tokenHelper');
const createModelSlug = require('../createModelSlug');
const { isRequestInternal } = require('../../utils/feathersUtils');

const removeProtectedFields = () => context => {
  if (context && context.data && !isRequestInternal(context)) {
    delete context.data.verified;
  }
  return context;
};

const traceResolvers = {
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
    owner: () => async (trace, context) => {
      if (!trace.ownerAddress) return;
      // eslint-disable-next-line no-param-reassign
      trace.owner = await context._loaders.user.address.load(trace.ownerAddress);
    },

    reviewer: () => async (trace, context) => {
      const { reviewerAddress } = trace;
      if (!reviewerAddress || reviewerAddress === ZERO_ADDRESS) return;
      // eslint-disable-next-line no-param-reassign
      trace.reviewer = await context._loaders.user.address.load(reviewerAddress);
    },

    campaignReviewer: () => async (trace, context) => {
      const { campaignReviewerAddress } = trace;
      if (!campaignReviewerAddress || campaignReviewerAddress === ZERO_ADDRESS) {
        return;
      }

      // eslint-disable-next-line no-param-reassign
      trace.campaignReviewer = await context._loaders.user.address.load(campaignReviewerAddress);
    },

    recipient: () => async (trace, context) => {
      const { recipientId, recipientAddress } = trace;
      if ((!recipientAddress || recipientAddress === ZERO_ADDRESS) && !recipientId) return;
      if (recipientId) {
        // TODO: join recipientId
        // currently the UI only supports the parent campaign. If we ever support more options,
        // then we will need to query pledgeAdmins first to fetch the typeId & type, then query
        // for the correct entity
        // eslint-disable-next-line no-param-reassign
        trace.recipient = await context._loaders.campaign.projectId.load(recipientId);
      } else {
        // eslint-disable-next-line no-param-reassign
        trace.recipient = await context._loaders.user.address.load(recipientAddress);
      }
    },

    pendingRecipient: () => async (trace, context) => {
      const { pendingRecipientAddress } = trace;
      if (pendingRecipientAddress && pendingRecipientAddress !== ZERO_ADDRESS) {
        // eslint-disable-next-line no-param-reassign
        trace.pendingRecipient = await context._loaders.user.address.load(pendingRecipientAddress);
      }
    },

    campaign: () => async (trace, context) => {
      const { campaignId } = trace;
      if (!campaignId) return;
      // eslint-disable-next-line no-param-reassign
      trace.campaign = await context._loaders.campaign.id.load(campaignId);
    },

    token: () => async (trace, _context) => {
      const { tokenAddress } = trace;
      const token = getTokenByAddress(tokenAddress);
      if (token) {
        trace.token = token;
      }
    },
  },
};

const getTraces = context => {
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

  const canUpdate = trace => {
    if (!trace) throw new errors.Forbidden();

    const approvedKeys = getApprovedKeys(trace, data, user);

    // Remove the keys that are not allowed
    Object.keys(data).forEach(key => {
      if (!approvedKeys.includes(key)) delete data[key];
    });

    // Milestone is not yet on chain, check the ETH conversion
    if ([TraceStatus.PROPOSED, TraceStatus.REJECTED].includes(trace.status)) {
      return checkConversionRates()(context);
    }
    // Milestone is on chain, remove data stored on-chain that can't be updated
    const keysToRemove = [
      'maxAmount',
      'reviewerAddress',
      'communityId',
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

    // needed b/c we need to call checkConversionRates for proposed traces
    // which is async
    return Promise.resolve();
  };

  return getTraces(context).then(traces =>
    Array.isArray(traces) ? Promise.all(traces.forEach(canUpdate)) : canUpdate(traces),
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
  // TODO every one can delete any Proposed and Rejected traces
  const isDeletable = trace => {
    if (!trace) throw new errors.NotFound();

    if (![TraceStatus.PROPOSED, TraceStatus.REJECTED].includes(trace.status)) {
      throw new errors.Forbidden('only proposed traces can be removed');
    }
  };

  return getTraces(context).then(traces => {
    if (Array.isArray(traces)) traces.forEach(isDeletable);
    else isDeletable(traces);
    return context;
  });
};

const storePrevState = () => context => {
  // do not update prevStatus when triggered by contract event
  // it has already been set
  const { params, data } = context;
  if (data.status && !params.eventTxHash) {
    return getTraces(context).then(trace => {
      data.prevStatus = trace.status;
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
 * Capture the address of the user who patched (= performed action on) the trace
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
      removeProtectedFields(),
      checkConversionRates(),
      checkTraceDates(),
      checkTraceName(),
      setAddress('ownerAddress'),
      ...address,
      isTraceAllowed(),
      isTokenAllowed(),
      sanitizeHtml('description'),
      convertTokenToTokenAddress(),
      createModelSlug('traces'),
    ],
    update: [
      removeProtectedFields(),
      restrict(),
      checkTraceDates(),
      ...address,
      sanitizeHtml('description'),
      convertTokenToTokenAddress(),
      checkTraceName(),
    ],
    patch: [
      removeProtectedFields(),
      restrict(),
      sanitizeAddress(
        ['pluginAddress', 'reviewerAddress', 'campaignReviewerAddress', 'recipientAddress'],
        { validate: true },
      ),
      sanitizeHtml('description'),
      storePrevState(),
      performedBy(),
      convertTokenToTokenAddress(),
      checkTraceName(),
      createModelSlug('traces'),
    ],
    remove: [
      restrictToOwner({
        idField: 'address',
        ownerField: 'ownerAddress',
      }),
      canDelete(),
    ],
  },

  after: {
    all: [commons.fastJoin(traceResolvers)],
    find: [addConfirmations(), resolveFiles(['image', 'items'])],
    get: [addConfirmations(), resolveFiles(['image', 'items'])],
    create: [handleTraceConversationAndEmail(), resolveFiles(['image', 'items']), updateCampaign()],
    update: [resolveFiles('image'), updateCampaign()],
    patch: [
      handleTraceConversationAndEmail(),
      resolveFiles(['image', 'items']),
      updateCampaign(),
      createModelSlug('traces'),
    ],
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
