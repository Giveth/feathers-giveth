const logger = require('winston');
const commons = require('feathers-hooks-common');
const { disallow } = require('feathers-hooks-common');
const sanitizeAddress = require('../../hooks/sanitizeAddress');
const errors = require('@feathersjs/errors');
const sanitizeHtml = require('../../hooks/sanitizeHtml');
const resolveFiles = require('../../hooks/resolveFiles');
const onlyInternal = require('../../hooks/onlyInternal');

/**
  API for creating conversations
  The following params are accepted when creating a message for a conversation

  @params:
    milestoneId:        (string) the id of the milestone that this conversation belongs to
    messageContext:     (string) context of the message, see MESSAGE_CONTEXT below
    message:            (string) the actual message
    replyToId:          (string) id of the message that this is a reply to

  @param ownerAddress (string) is automatically set based on the current logged in user
* */

/**
  Available conversation types. This roughly follows the milestone status
  replyTo is for threaded messages
* */
const MESSAGE_CONTEXT = [
  'proposed',
  'rejected',
  'NeedsReview',
  'Completed',
  'Canceled',
  'replyTo',
  'proposedRejected',
  'proposedAccepted',
  'rePropose',
  'archived',
  'payment',
];

/**
 Only people involved with the milestone can create conversation
 Sets the address creating the conversation as the owner
 */
const restrictAndSetOwner = () => context => {
  const { app, params } = context;
  const { milestoneId } = context.data;
  const { user, performedByAddress } = params;

  // external calls need a user
  if (!user && context.params.provider) throw new errors.NotAuthenticated();

  return app
    .service('milestones')
    .get(milestoneId)
    .then(milestone => {
      // for internal calls there's no user, so the user creating the message is passed as a context.params.performedByAddress
      // for external calls, the current user creates the message
      context.data.ownerAddress = (user && user.address) || performedByAddress;

      // set the role based on the address
      // anyone not involved with the milestone is not allowed to create conversation
      // not taking into account that a user has one or more of these roles
      switch (context.data.ownerAddress) {
        case milestone.ownerAddress:
          context.data.performedByRole = 'Milestone Owner';
          break;
        case milestone.campaign.ownerAddress:
          context.data.performedByRole = 'Campaign Manager';
          break;
        case milestone.campaign.coownerAddress:
          context.data.performedByRole = 'Campaign Co-Manager';
          break;
        case milestone.recipientAddress:
          context.data.performedByRole = 'Recipient';
          break;
        case milestone.reviewerAddress:
          context.data.performedByRole = 'Reviewer';
          break;
        case milestone.campaignReviewerAddress:
          context.data.performedByRole = 'Campaign Reviewer';
          break;
        default:
          throw new errors.Forbidden(
            'Only people involved with the milestone can create conversation',
          );
      }
      return context;
    })
    .catch(e => {
      logger.error(`unable to get milestone ${milestoneId}`, e);
    });
};

/**
  message must be in context of the conversation
  for example, it must include milestone state 'proposed' if the message is about a proposal
 * */
const checkMessageContext = () => context => {
  const { messageContext, replyToId } = context.data;
  const { app } = context;

  if (!MESSAGE_CONTEXT.includes(messageContext))
    throw new errors.BadRequest('Incorrect message context');

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
    find: [commons.populate({ schema }), resolveFiles(['items'])],
    get: [commons.populate({ schema }), resolveFiles(['items'])],
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
