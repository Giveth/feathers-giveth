const Item = require('./item.model');
const { AdminTypes } = require('./pledgeAdmins.model');

// conversations-model.js - A mongoose model
//
// See http://mongoosejs.com/docs/models.html
// for more of what you can do here.

/**
 Available conversation types. This roughly follows the milestone status
 replyTo is for threaded messages
 * */
const CONVERSATION_MESSAGE_CONTEXT = {
  CANCELLED: 'Canceled',
  COMPLETED: 'Completed',
  NEEDS_REVIEW: 'NeedsReview',
  ARCHIVED: 'archived',
  COMMENT: 'comment',
  DELEGATED: 'delegated',
  DONATED: 'donated',
  PAYMENT: 'payment',
  PROPOSED_ACCEPTED: 'proposedAccepted',
  PROPOSED_REJECTED: 'proposedRejected',
  RE_PROPOSE: 'rePropose',
  REJECTED: 'rejected',
  REPLY_TO: 'replyTo',
  PROPOSED: 'proposed',
};

const createModel = function Conversations(app) {
  const mongooseClient = app.get('mongooseClient');
  const { Schema } = mongooseClient;

  const conversation = new Schema(
    {
      milestoneId: { type: String, required: true },
      messageContext: { type: String, required: true },
      message: { type: String },
      replyToId: { type: String },
      performedByRole: { type: String, required: true },
      ownerAddress: { type: String, required: true },
      recipientAddress: { type: String },
      payments: [
        {
          amount: { type: Schema.Types.BN, min: 0 },
          symbol: { type: String },
          tokenDecimals: { type: String },
        },
      ],
      donorType: { type: String, enum: Object.values(AdminTypes) },
      donorId: { type: String },

      // this is for payment conversations
      donationId: { type: String },
      items: [Item],
      txHash: { type: String },
      mined: { type: Boolean, default: false },
    },
    {
      timestamps: true,
    },
  );

  conversation.index({ milestoneId: 1, txHash: 1, messageContext: 1 });
  conversation.index({ milestoneId: 1, createdAt: 1 });
  return mongooseClient.model('conversation', conversation);
};

module.exports = {
  createModel,
  CONVERSATION_MESSAGE_CONTEXT,
};
