const mongoose = require('mongoose');
require('./mongoose-bn')(mongoose);

const { Schema } = mongoose;

const Token = new Schema({
  name: { type: String, required: true },
  address: { type: String, required: true },
  foreignAddress: { type: String, required: true },
  symbol: { type: String, required: true },
  decimals: { type: String, required: true },
});

module.exports = Token;
