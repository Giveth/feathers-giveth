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
      title: { type: String },
      address: { type: String, required: true },
      txHash: { type: String, required: true },
      eventId: { type: String },
      userRole: { type: String },
      userAction: { type: String },
      projectType: { type: String },
      amount: {type: Schema.Types.BN, min: 0 },
    },
    {
      timestamps: true,
    },
  );
  return mongooseClient.model('transactions', transactions);
};
