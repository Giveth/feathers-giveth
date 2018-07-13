// transactions-model.js - A mongoose model
//
// See http://mongoosejs.com/docs/models.html
// for more of what you can do here.
module.exports = function Transactions(app) {
  const mongooseClient = app.get('mongooseClient');
  const { Schema } = mongooseClient;
  const transactions = new Schema(
    {
        // transactionId: { type: Number, required: true },
        // amount: { type: Number, required: true },
        // to: { type: String },
      id: { type: String, required: true },
      blockHash: { type: String, required: true },
      blockNumber: { type: Number, required: true },
      address: { type: String, required: true },
      txHash: { type: String, required: true },
      eventId: { type: String },
      title: { type: String },
      entity: { type: String },
      returnValues: { type: Object },
      userRole: { type: String },
      userAction: { type: String },
      projectType: { type: String },
    },
    {
      timestamps: true,
    },
  );
  return mongooseClient.model('transactions', transactions);
};
