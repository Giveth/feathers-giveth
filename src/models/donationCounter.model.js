const mongoose = require('mongoose');
require('./mongoose-bn')(mongoose);

const { Schema } = mongoose;

const DonationCounter = new Schema({
  name: { type: String, required: true },
  address: { type: String, required: true },
  decimals: { type: String, required: true },
  symbol: { type: String, required: true },
  totalDonated: { type: Schema.Types.BN, min: 0 },
  currentBalance: { type: Schema.Types.BN, min: 0 },
  donationCount: { type: Number },
});

module.exports = DonationCounter;
