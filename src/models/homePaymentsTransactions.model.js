function HomePaymentsTransactions(app) {
  const mongooseClient = app.get('mongooseClient');
  const { Schema } = mongooseClient;
  const homePaymentsTransactions = new Schema({
    hash: { type: String, required: true, index: true },
    event: { type: String, require: true },
    usdValue: { type: Number, required: true },
    recipientAddress: { type: String, required: true },
    milestoneId: { type: String, require: true },
    campaignId: { type: String, require: true },
    gasUsed: { type: Schema.Types.BN, required: true, min: 0 },
    timestamp: { type: Date, require: true },
    from: { type: String, require: true },
    payments: [
      {
        amount: { type: Schema.Types.BN, min: 0 },
        symbol: { type: String },
      },
    ],
    paidByGiveth: { type: Boolean, required: true },
    paymentId: { type: Schema.Types.BN },
  });

  homePaymentsTransactions.index({ hash: 1, recipientAddress: 1 }, { unique: true });
  homePaymentsTransactions.index({ hash: 1, event: 1 });
  homePaymentsTransactions.index({ recipientAddress: 1, paidByGiveth: 1 });
  homePaymentsTransactions.index({ milestoneId: 1, paidByGiveth: 1 });
  homePaymentsTransactions.index({ campaignId: 1, paidByGiveth: 1 });

  return mongooseClient.model('homePaymentsTransactions', homePaymentsTransactions);
}

module.exports = {
  createModel: HomePaymentsTransactions,
};
