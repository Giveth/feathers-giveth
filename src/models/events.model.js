// events-model.js - A mongoose model
//
// See http://mongoosejs.com/docs/models.html
// for more of what you can do here.
module.exports = function Events(app) {
  const mongooseClient = app.get('mongooseClient');
  const { Schema } = mongooseClient;
  const event = new Schema(
    {
      logIndex: { type: Number, required: true },
      transactionIndex: { type: Number, required: true },
      transactionHash: { type: String, required: true },
      blockHash: { type: String, required: true },
      blockNumber: { type: Number, required: true },
      address: { type: String, required: true },
      type: { type: String },
      id: { type: String, required: true },
      returnValues: { type: Object },
      event: { type: String },
      signature: { type: String },
      raw: { type: Object },
      topics: [String],
      confirmed: { type: Boolean },
      confirmations: { type: Number, require: true },
    },
    {
      timestamps: true,
    },
  );

  return mongooseClient.model('event', event);
};
