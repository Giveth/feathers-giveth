// donationsHistory-model.js - A mongoose model
// 
// See http://mongoosejs.com/docs/models.html
// for more of what you can do here.
module.exports = function (app) {
  const mongooseClient = app.get('mongooseClient');
  const { Schema } = mongooseClient;
  const donationHistory = new Schema({
    ownerId: { type: String, required: true, index: true },
    ownerType: { type: String },
    amount: { type: String },
    txHash: { type: String },
    donationId: { type: String, required: true },
    giverAddress: { type: String, required: true },
    delegateType: { type: String },
    delegateId: { type: String },
    fromDonationId: { type: String },
    fromOwnerId: { type: String },
    fromOwnerType: { type: String }
  }, {
    timestamps: true
  });

  return mongooseClient.model('donationsHistory', donationHistory);
};
