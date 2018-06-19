// conversations-model.js - A mongoose model
//
// See http://mongoosejs.com/docs/models.html
// for more of what you can do here.
module.exports = function Conversations(app) {
  const mongooseClient = app.get('mongooseClient');
  const { Schema } = mongooseClient;
  const conversation = new Schema(
    {
      milestoneId: { type: String, required: true, index: true },
      messageContext: { type: String, required: true },
      message: { type: String, required: true },
      replyToId: { type: String },
      performedByRole: { type: String, required: true },
      ownerAddress: { type: String, required: true },
    },
    {
      timestamps: true,
    },
  );

  return mongooseClient.model('conversation', conversation);
};
