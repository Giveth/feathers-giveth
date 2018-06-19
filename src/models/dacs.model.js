// dacs-model.js - A mongoose model
//
// See http://mongoosejs.com/docs/models.html
// for more of what you can do here.
module.exports = function DAC(app) {
  const mongooseClient = app.get('mongooseClient');
  const { Schema } = mongooseClient;
  const dac = new Schema(
    {
      title: { type: String, required: true },
      description: { type: String, required: true },
      communityUrl: { type: String },
      summary: { type: String },
      delegateId: { type: String, index: true },
      image: { type: String, required: true },
      txHash: { type: String },
      totalDonated: { type: String },
      donationCount: { type: Number },
      tokenName: { type: String, required: true },
      tokenSymbol: { type: String, required: true },
      ownerAddress: { type: String, required: true, index: true },
      pluginAddress: { type: String },
      tokenAddress: { type: String },
      mined: { type: Boolean },
    },
    {
      timestamps: true,
    },
  );

  return mongooseClient.model('dac', dac);
};
