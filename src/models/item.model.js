const mongoose = require('mongoose');
const { Schema } = mongoose;

const Item = new Schema({
  date: { type: Date, required: true },
  description: { type: String, required: true },
  image: { type: String },
  selectedFiatType: { type: String, required: true },
  fiatAmount: { type: String, required: true },
  etherAmount: { type: String },
  wei: { type: String },
  conversionRate: { type: Number, required: true },
  ethConversionRateTimestamp: { type: Date, required: true },
});

export default Item;