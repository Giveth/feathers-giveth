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
      giverId: { type: String },
      commitTime: { type: String },
      avatar: { type: String },
    },
    {
      timestamps: true,
    },
  );

  return mongooseClient.model('user', user);
};
