// blockchain-model.js - A mongoose model
//
// See http://mongoosejs.com/docs/models.html
// for more of what you can do here.
module.exports = function Blockchain(app) {
  const mongooseClient = app.get('mongooseClient');
  const { Schema } = mongooseClient;
  const blockchain = new Schema(
    {
      _id: { type: Schema.ObjectId, required: true },
      lastBlock: { type: Number, required: true },
    },
    {
      timestamps: true,
    },
  );

  return mongooseClient.model('blockchain', blockchain);
};
