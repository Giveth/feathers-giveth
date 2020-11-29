function createModel(app) {
  const mongooseClient = app.get('mongooseClient');
  const { Schema } = mongooseClient;
  const token = new Schema({
      name: { type: String, required: true },
      address: { type: String, required: true },
      foreignAddress: { type: String, required: true },
      symbol: { type: String, required: true, unique: true },
      decimals: { type: String, required: true },
      rateEqSymbol: { type: String },

    },
    {
      timestamps: true,
    });

  return mongooseClient.model('token', token);
}

module.exports = {
  createModel,
};
