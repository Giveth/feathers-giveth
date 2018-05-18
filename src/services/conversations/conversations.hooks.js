import logger from 'winston';
import commons from 'feathers-hooks-common';
import { updatedAt, createdAt } from '../../hooks/timestamps';
import { disallow } from 'feathers-hooks-common';
import sanitizeAddress from '../../hooks/sanitizeAddress';
import errors from 'feathers-errors';
import sanitizeHtml from '../../hooks/sanitizeHtml';

/**
  API for creating conversations
  The following params are accepted when creating a message for a conversation

  @params:
    milestoneId:        (string) the id of the milestone that this conversation belongs to
    messageContext:     (string) context of the message, see MESSAGE_CONTEXT below
    message:            (string) the actual message
    replyToId:          (string) id of the message that this is a reply to

  @param ownerAddress (string) is automatically set based on the current logged in user
**/


/**
  Available conversation types. This roughly follows the milestone status
  ReplyTo is for threaded messages
**/
const MESSAGE_CONTEXT = [
  'proposed',
  'rejected',
  'NeedsReview',
  'Completed',
  'Canceled',
  'ReplyTo',
  'proposedRejected',
  'proposedAccepted',
  'rePropose'
];

/**
 Only people involved with the milestone can create conversation
 Sets the address creating the conversation as the owner
 */
const restrictAndSetOwner = () => context => {
  const { app, params } = context;
  const { milestoneId } = context.data;
  let { user } = params;

  // external calls need a user
  if (!user && context.params.provider) throw new errors.NotAuthenticated();

  return new Promise((resolve, reject) => {
    app
      .service('milestones')
      .get(milestoneId)
      .then(milestone => {
        // console.log('user', user)
        // console.log('milestone', milestone)

        // for internal calls there's no user, so the user creating the message is stored on the milestone
        // for external calls, the currentuser creates the message
        context.data.ownerAddress = user && user.address || milestone.performedByAddress;
        delete context.data.user;

        if (
          context.data.ownerAddress !== milestone.ownerAddress &&
          context.data.ownerAddress !== milestone.reviewerAddress &&
          context.data.ownerAddress !== milestone.recipientAddress &&
          context.data.ownerAddress !== milestone.campaignReviewerAddress
        ) throw new errors.Forbidden('Only people involved with the milestone can create conversation');
        resolve(context);
      }).catch(e => {
        logger.error(`unable to get milestone ${milestoneId}`, e);
        reject();
      });   
  }) 
}


/**
  message must be in context of the conversation
  for example, it must include milestone state 'proposed' if the message is about a proposal
 **/
const checkMessageContext = () => context => {
  const { messageContext, replyToId } = context.data;
  const { app, params } = context;

  if (!MESSAGE_CONTEXT.includes(messageContext)) 
    throw new errors.BadRequest('Incorrect message context');    

  if (messageContext === 'ReplyTo') {
    return new Promise((resolve, reject) => {
      app
        .service('conversations')
        .get(replyToId)
        .then(message => resolve())
        .catch(e => {
          logger.error(`this message is in reply to a non-existing message with id ${replyToId}`, e);
          reject();
        });   
    }) 
  }
}


/**
  include user object when querying message
 **/
const schema = {
  include: [
    {
      service: 'users',
      nameAs: 'owner',
      parentField: 'ownerAddress',
      childField: 'address',
    }
  ],
};


/**
  The bas-ass stuff happens here...
 **/
module.exports = {
  before: {
    all: [],
    find: [
      sanitizeAddress([ 'ownerAddress' ]),
    ],
    get: [],
    create: [restrictAndSetOwner(), checkMessageContext(), sanitizeHtml('message'), createdAt],
    update: [disallow()],
    patch: [disallow()],
    remove: [disallow()]
  },

  after: {
    all: [],
    find: [commons.populate({ schema })],
    get: [commons.populate({ schema })],
    create: [],
    update: [],
    patch: [],
    remove: []
  },

  error: {
    all: [],
    find: [],
    get: [],
    create: [],
    update: [],
    patch: [],
    remove: []
  }
};
