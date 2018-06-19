// donationTokens-model.js - A mongoose model
//
// See http://mongoosejs.com/docs/models.html
// for more of what you can do here.
module.exports = function DonationToken(app) {
  const mongooseClient = app.get('mongooseClient');
  const { Schema } = mongooseClient;
  const donationToken = new Schema(
    {
      tokenAddress: { type: String, required: true, index: true },
      tokenName: { type: String, required: true },
      tokenSymbol: { type: String, required: true },
      balance: { type: String, required: true },
      userAddress: { type: String, required: true, index: true },
    },
    {
      timestamps: true,
    },
  );

  return mongooseClient.model('donationToken', donationToken);
};
