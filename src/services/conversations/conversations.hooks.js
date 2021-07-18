const logger = require('winston');
const commons = require('feathers-hooks-common');
const { disallow } = require('feathers-hooks-common');
const errors = require('@feathersjs/errors');
const { getItems } = require('feathers-hooks-common');
const sanitizeAddress = require('../../hooks/sanitizeAddress');
const sanitizeHtml = require('../../hooks/sanitizeHtml');
const resolveFiles = require('../../hooks/resolveFiles');
const onlyInternal = require('../../hooks/onlyInternal');
const { AdminTypes } = require('../../models/pledgeAdmins.model');
const { CONVERSATION_MESSAGE_CONTEXT } = require('../../models/conversations.model');
const { isRequestInternal } = require('../../utils/feathersUtils');

/**
 API for creating conversations
 The following params are accepted when creating a message for a conversation

 @params:
 traceId:        (string) the id of the trace that this conversation belongs to
 messageContext:     (string) context of the message, see MESSAGE_CONTEXT below
 message:            (string) the actual message
 replyToId:          (string) id of the message that this is a reply to

 @param ownerAddress (string) is automatically set based on the current logged in user
 * */

/**
 Only people involved with the trace can create conversation
 Sets the address creating the conversation as the owner
 */
const restrictAndSetOwner = () => context => {
  const { app, params } = context;
  const { traceId } = context.data;
  const { user, performedByAddress } = params;

  // external calls need a user
  if (!user && context.params.provider) throw new errors.NotAuthenticated();

  return app
    .service('traces')
    .get(traceId)
    .then(trace => {
      // for internal calls there's no user, so the user creating the message is passed as a context.params.performedByAddress
      // for external calls, the current user creates the message
      context.data.ownerAddress = (user && user.address) || performedByAddress;

      // set the role based on the address
      // anyone not involved with the trace is not allowed to create conversation
      // not taking into account that a user has one or more of these roles
      switch (context.data.ownerAddress) {
        case trace.campaign.ownerAddress:
          context.data.performedByRole = 'Campaign Manager';
          break;
        case trace.campaign.coownerAddress:
          context.data.performedByRole = 'Campaign Co-Manager';
          break;
        case trace.ownerAddress:
          context.data.performedByRole = 'Trace Owner';
          break;
        case trace.recipientAddress:
          context.data.performedByRole = 'Recipient';
          break;
        case trace.reviewerAddress:
          context.data.performedByRole = 'Reviewer';
          break;
        case trace.campaignReviewerAddress:
          context.data.performedByRole = 'Campaign Reviewer';
          break;
        default:
          if (isRequestInternal(context)) {
            //  It's created when someone donated, so maybe he/she is not involved with trace
            context.data.performedByRole = '';
          } else {
            throw new errors.Forbidden(
              'Only people involved with the trace can create conversation',
            );
          }
      }
      return context;
    })
    .catch(e => {
      logger.error(`unable to get trace ${traceId}`, e);
    });
};

/**
 message must be in context of the conversation
 for example, it must include trace state 'proposed' if the message is about a proposal
 * */
const checkMessageContext = () => context => {
  const { messageContext, replyToId } = context.data;
  const { app } = context;

  if (!Object.values(CONVERSATION_MESSAGE_CONTEXT).includes(messageContext))
    throw new errors.BadRequest('Incorrect message context');

  // TODO it should be CONVERSATION_MESSAGE_CONTEXT.REPLY_TO that is replyTo not ReplyTo
  if (messageContext === 'ReplyTo') {
    return app
      .service('conversations')
      .get(replyToId)
      .then(() => context)
      .catch(e => {
        logger.error(`this message is in reply to a non-existing message with id ${replyToId}`, e);
      });
  }

  return context;
};

/**
 * populate delegator title
 */
const populateDonorTitle = () => context => {
  const addDonorTitle = async item => {
    const { donorId, donorType } = item;
    if (!donorId || !donorType) return Promise.resolve(item);
    const { app } = context;

    let service;
    let query;
    let field;

    switch (donorType) {
      case AdminTypes.COMMUNITY:
        service = app.service('communities');
        query = { _id: donorId };
        field = 'title';
        break;
      case AdminTypes.CAMPAIGN:
        service = app.service('campaigns');
        query = { _id: donorId };
        field = 'title';
        break;
      case AdminTypes.GIVER:
        service = app.service('users');
        query = { address: donorId };
        field = 'name';
        break;
      default:
        return Promise.resolve(item);
    }

    const donor = await service.Model.findOne(query, [field]);
    item.donorTitle = donor[field];

    return item;
  };

  const items = getItems(context);
  if (!Array.isArray(items)) {
    return addDonorTitle(items).then(() => context);
  }

  return Promise.all(items.map(addDonorTitle)).then(() => context);
};

/**
 include user object when querying message
 * */
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
      nameAs: 'recipient',
      parentField: 'recipientAddress',
      childField: 'address',
    },
  ],
};

/**
 The bas-ass stuff happens here...
 * */
module.exports = {
  before: {
    all: [],
    find: [sanitizeAddress(['ownerAddress'])],
    get: [],
    create: [restrictAndSetOwner(), checkMessageContext(), sanitizeHtml('message')],
    update: [disallow()],
    patch: [onlyInternal()],
    remove: [disallow()],
  },

  after: {
    all: [],
    find: [commons.populate({ schema }), populateDonorTitle(), resolveFiles(['items'])],
    get: [commons.populate({ schema }), populateDonorTitle(), resolveFiles(['items'])],
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
