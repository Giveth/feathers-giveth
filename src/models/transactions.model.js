function Transaction(app) {
  const mongooseClient = app.get('mongooseClient');
  const { Schema } = mongooseClient;
  const transaction = new Schema(
    {
      hash: { type: String, required: true, index: true },
      from: { type: String },
      gasPrice: { type: Number },
      gasUsed: { type: Number },
      blockNumber: { type: Number },
      isHome: { type: Boolean, default: false },
      timestamp: { type: Date },
    },
    {
      timestamps: false,
    },
  );

  return mongooseClient.model('transactions', transaction);
}

module.exports = {
  createModel: Transaction,
};
