// events-model.js - A mongoose model
const EventStatus = {
  PENDING: 'Pending', // PENDING events were p/u by the ws subscription, but have yet to contain >= requiredConfirmations
  WAITING: 'Waiting', // WAITING events have been p/u by polling, have >= requiredConfirmations, & are ready to process
  PROCESSING: 'Processing',
  PROCESSED: 'Processed',
  FAILED: 'Failed',
};
//
// See http://mongoosejs.com/docs/models.html
// for more of what you can do here.
function createModel(app) {
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
      status: {
        type: String,
        require: true,
        enum: Object.values(EventStatus),
        default: EventStatus.WAITING,
      },
      processingError: { type: String },
      confirmations: { type: Number, require: true },
    },
    {
      timestamps: true,
    },
  );

  return mongooseClient.model('event', event);
}

module.exports = {
  createModel,
  EventStatus,
};
