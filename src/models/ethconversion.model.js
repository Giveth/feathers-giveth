// ethconversion-model.js - A mongoose model
//
// See http://mongoosejs.com/docs/models.html
// for more of what you can do here.
module.exports = function ETHConversion(app) {
  const mongooseClient = app.get('mongooseClient');
  const { Schema } = mongooseClient;
  const ethconversion = new Schema(
    {
      timestamp: { type: Date, required: true },
      rates: { type: Object },
      symbol: { type: String, required: true }
    },
    {
      timestamps: true,
    },
  );

  ethconversion.index({ timestamp: 1, symbol: 1}, { unique: true });

  return mongooseClient.model('ethconversion', ethconversion);
};
