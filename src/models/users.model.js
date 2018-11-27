// user-model.js - A mongoose model
//
// See http://mongoosejs.com/docs/models.html
// for more of what you can do here.
module.exports = function User(app) {
  const mongooseClient = app.get('mongooseClient');
  const { Schema } = mongooseClient;
  const user = new Schema(
    {
      address: { type: String, required: true, index: true, unique: true },
      name: { type: String },
      email: { type: String },
      giverId: { type: Schema.Types.Long }, // we can use Long here b/c lp only stores adminId in pledges as uint64
      commitTime: { type: Number },
      avatar: { type: String },
      linkedin: { type: String },
      url: { type: String },
    },
    {
      timestamps: true,
    },
  );

  return mongooseClient.model('user', user);
};
