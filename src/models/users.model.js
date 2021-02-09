// user-model.js - A mongoose model
//
// See http://mongoosejs.com/docs/models.html
// for more of what you can do here.
module.exports = function User(app) {
  const mongooseClient = app.get('mongooseClient');
  const { Schema } = mongooseClient;
  const user = new Schema(
    {
      address: { type: String, required: true, unique: true },
      name: { type: String },
      email: { type: String },
      giverId: { type: Schema.Types.Long, index: true }, // we can use Long here b/c lp only stores adminId in pledges as uint64
      commitTime: { type: Number },
      avatar: { type: String },
      prevAvatar: { type: String }, // To store deleted/cleared lost ipfs values
      linkedin: { type: String },
      url: { type: String },
      isReviewer: { type: Boolean, default: false },
      isDelegator: { type: Boolean, default: false },
      isInProjectOwner: { type: Boolean, default: false },
      prevUrl: { type: String }, // To store deleted/cleared lost ipfs values
      currency: { type: String }, // Users's native currency
    },
    {
      timestamps: true,
    },
  );
  user.index({ address: 1, lastFunded: 1 });
  return mongooseClient.model('user', user);
};
