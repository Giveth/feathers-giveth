const mongoose = require('mongoose');
require('./mongoose-bn')(mongoose);

const { Schema } = mongoose;

const Item = new Schema({
  date: { type: Date, required: true },
  description: { type: String, required: true },
  image: { type: String },
  selectedFiatType: { type: String, required: true },
  fiatAmount: { type: Number, required: true }, // FIXME: This should be string as well, but I don't dare to change it now
  wei: { type: Schema.Types.BN, min: 0, required: true },
  conversionRate: { type: Number, required: true },
  conversionRateTimestamp: { type: Date, required: true },
});

module.exports = Item;
