// conversionRates-model.js - A mongoose model
//
// See http://mongoosejs.com/docs/models.html
// for more of what you can do here.
module.exports = function conversion(app) {
  const mongooseClient = app.get('mongooseClient');
  const { Schema } = mongooseClient;
  const conversionRates = new Schema(
    {
      timestamp: { type: Date, required: true },
      rates: { type: Object },
      symbol: { type: String, required: true },
    },
    {
      timestamps: true,
    },
  );

  conversionRates.index({ timestamp: 1, symbol: 1 }, { unique: true });

  return mongooseClient.model('conversionRates', conversionRates);
};
