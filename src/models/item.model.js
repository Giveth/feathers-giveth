const mongoose = require('mongoose');
require('./mongoose-bn')(mongoose);

const { Schema } = mongoose;

const Item = new Schema({
  date: { type: Date, required: true },
  description: { type: String, required: true },
  image: { type: String },
  selectedFiatType: { type: String, required: true },
  fiatAmount: { type: Number, required: true },
  etherAmount: { type: Number },
  wei: { type: Schema.Types.BN, min: 0 },
  conversionRate: { type: Number, required: true },
  ethConversionRateTimestamp: { type: Date, required: true },
});

module.exports = Item;
