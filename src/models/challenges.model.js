// challenges-model.js - A mongoose model
//
// See http://mongoosejs.com/docs/models.html
// for more of what you can do here.
module.exports = function Challenge(app) {
  const mongooseClient = app.get('mongooseClient');
  const { Schema } = mongooseClient;
  const challenge = new Schema(
    {
      address: { type: String, required: true, index: true, unique: true },
      expirationDate: { type: Date },
      message: { type: String },
    },
    {
      timestamps: true,
    },
  );

  return mongooseClient.model('challenge', challenge);
};
