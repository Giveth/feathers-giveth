// campaigns-model.js - A mongoose model
// 
// See http://mongoosejs.com/docs/models.html
// for more of what you can do here.
module.exports = function (app) {
  const mongooseClient = app.get('mongooseClient');
  const { Schema } = mongooseClient;
  const campaign = new Schema({
    title: { type: String, required: true },
    description: { type: String, required: true },
    projectId: { type: String, index: true },
    image: { type: String, required: true },
    txHash: { type: String },
    totalDonated: { type: String },
    donationCount: { type: Number },
    peopleCount: { type: Number },
    tokenName: { type: String, required: true },
    tokenSymbol: { type: String, required: true },
    dacs: { type: [ String ] },
    reviewerAddress: { type: String, required: true, index: true },
    ownerAddress: { type: String, required: true, index: true },
    pluginAddress: { type: String },
    tokenAddress: { type: String },
    mined: { type: Boolean },
    status: { type: String },
  }, {
    timestamps: true
  });

  return mongooseClient.model('campaign', campaign);
};
