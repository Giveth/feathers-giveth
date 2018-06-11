// conversations-model.js - A mongoose model
// 
// See http://mongoosejs.com/docs/models.html
// for more of what you can do here.
module.exports = function (app) {
  const mongooseClient = app.get('mongooseClient');
  const { Schema } = mongooseClient;
  const conversation = new Schema({
    milestoneId: { type: String, required: true, index: true, unique: true },
    messageContext: { type: String, required: true },
    message: { type: String, required: true },
    replyToId: { type: String }
  }, {
    timestamps: true
  });

  return mongooseClient.model('conversation', conversation);
};
