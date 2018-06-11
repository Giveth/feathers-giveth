// events-model.js - A mongoose model
// 
// See http://mongoosejs.com/docs/models.html
// for more of what you can do here.
module.exports = function (app) {
  const mongooseClient = app.get('mongooseClient');
  const { Schema } = mongooseClient;
  const event = new Schema({
    logIndex: { type: String },
    transactionIndex: { type: String },
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
    topics: [ String ],
    confirmed: { type: Boolean },
    confirmations: { type: Number }
  }, {
    timestamps: true
  });

  return mongooseClient.model('event', event);
};
