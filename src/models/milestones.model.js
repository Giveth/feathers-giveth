import Item from './item.model.js';

// milestones-model.js - A mongoose model
//
// See http://mongoosejs.com/docs/models.html
// for more of what you can do here.
module.exports = function Milestone(app) {
  const mongooseClient = app.get('mongooseClient');
  const { Schema } = mongooseClient;

  const milestone = new Schema(
    {
      title: { type: String, required: true },
      description: { type: String, required: true },
      image: { type: String },
      maxAmount: { type: String, required: true },
      ownerAddress: { type: String, required: true, index: true },
      reviewerAddress: { type: String, required: true, index: true },
      recipientAddress: { type: String, required: true, index: true },
      campaignReviewerAddress: { type: String, required: true, index: true },
      campaignId: { type: String, required: true, index: true },
      projectId: { type: String, index: true },
      status: { type: String, required: true },
      items: [Item],
      ethConversionRateTimestamp: { type: Date, required: true },
      selectedFiatType: { type: String, required: true },
      date: { type: Date, required: true },
      fiatAmount: { type: String, required: true },
      etherAmount: { type: String },
      conversionRate: { type: Number, required: true },
      txHash: { type: String },
      pluginAddress: { type: String },
      totalDonated: { type: String },
      donationCount: { type: Number },
      mined: { type: Boolean },
      prevStatus: { type: String },
      performedByAddress: { type: String },

      // these 2 fields should not be stored in mongo
      // but we need them for temporary storage
      // as mongoose virtuals do not persist in after hooks
      message: { type: String },
      proofItems: [ Item ],
      messageContext: { type: String },
    },
    {
      timestamps: true,
    },
  );

  return mongooseClient.model('milestone', milestone);
};
