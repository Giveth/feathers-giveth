import logger from 'winston';
import { updatedAt, createdAt } from '../../hooks/timestamps';
import { disallow } from 'feathers-hooks-common';
import sanitizeAddress from '../../hooks/sanitizeAddress';

/**
  API for creating conversations
  The following params are accepted when creating a message for a conversation

  @params:
    milestoneId:      (string) the id of the milestone that this conversation belongs to
    messageContext:   (string) context of the message, see MESSAGE_CONTEXT below
    message:          (string) the actual message
    replyToId:        (string) id of the message that this is a reply to

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
  'ReplyTo'
];

/**
 Only people involved with the milestone can create conversation
 */
const restrict = () => context => {
  if (!context.params.provider) return context;   // internal calls are fine

  const { app, params } = context;
  const { milestoneId } = context.data;
  const { user } = params;

  if (!user) throw new errors.NotAuthenticated();

  return new Promise((resolve, reject) => {
    app
      .service('milestone')
      .get(milestoneId)
      .then(milestone => {
        if (
          user.address !== milestone.ownerAddress || 
          user.address !== milestone.reviewerAddress || 
          user.address !== milestone.recipientAddress ||
          user.address !== milestone.campaignReviewerAddress
        ) throw new errors.Forbidden('Only people involved with the milestone can create conversation');
        resolve();
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
  sets the current user as owner of this message
 **/
const setUser = () => context => {
  return context.data.ownerAddress = context.params.user.address;
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
    create: [restrict, checkMessageContext, setUser, createdAt],
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
