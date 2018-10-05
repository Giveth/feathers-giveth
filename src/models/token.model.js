const mongoose = require('mongoose');
require('./mongoose-bn')(mongoose);

const { Schema } = mongoose;

const Token = new Schema({
  name: { type: String, required: true },
  address: { type: String, required: true },
});

module.exports = Token;
