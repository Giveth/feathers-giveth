const Item = require('./item.model');
const { AdminTypes } = require('./pledgeAdmins.model');

// conversations-model.js - A mongoose model
//
// See http://mongoosejs.com/docs/models.html
// for more of what you can do here.
module.exports = function Conversations(app) {
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
      donorAddress: { type: String },
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
