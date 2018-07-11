// milestones-model.js - A mongoose model
//
// See http://mongoosejs.com/docs/models.html
// for more of what you can do here.
const MilestoneStatus = {
  PROPOSED: 'Proposed',
  REJECTED: 'Rejected',
  PENDING: 'Pending',
  IN_PROGRESS: 'InProgress',
  NEEDS_REVIEW: 'NeedsReview',
  COMPLETED: 'Completed',
  CANCELED: 'Canceled',
  PAYING: 'Paying',
  PAID: 'Paid',
  FAILED: 'Failed',
};

function Milestone(app) {
  const mongooseClient = app.get('mongooseClient');
  const { Schema } = mongooseClient;

  const Item = new Schema({
    // id: { type: String, 'default': shortid.generate },
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
      messageContext: { type: String },
    },
    {
      timestamps: true,
    },
  );

  return mongooseClient.model('milestone', milestone);
}

module.exports = {
  MilestoneStatus,
  createModel: Milestone,
};
