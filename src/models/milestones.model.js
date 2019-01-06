const Item = require('./item.model');
const Token = require('./token.model');
const DonationCounter = require('./donationCounter.model');

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

  const milestone = new Schema(
    {
      title: { type: String, required: true },
      description: { type: String, required: true },
      image: { type: String },
      maxAmount: { type: Schema.Types.BN, required: true },
      ownerAddress: { type: String, required: true, index: true },
      reviewerAddress: { type: String, required: true, index: true },
      recipientAddress: { type: String, required: true, index: true },
      campaignReviewerAddress: { type: String, required: true, index: true },
      campaignId: { type: String, required: true, index: true },
      projectId: { type: Schema.Types.Long, index: true }, // we can use Long here b/c lp only stores adminId in pledges as uint64
      status: {
        type: String,
        require: true,
        enum: Object.values(MilestoneStatus),
      },
      items: [Item],
      conversionRateTimestamp: { type: Date, required: true },
      selectedFiatType: { type: String, required: true },
      date: { type: Date, required: true },
      fiatAmount: { type: Number, required: true },
      conversionRate: { type: Number, required: true },
      txHash: { type: String },
      pluginAddress: { type: String },
      fullyFunded: { type: Boolean, default: false },
      donationCounters: [DonationCounter],
      peopleCount: { type: Number },
      mined: { type: Boolean },
      prevStatus: { type: String },
      url: { type: String },

      // these 2 fields should not be stored in mongo
      // but we need them for temporary storage
      // as mongoose virtuals do not persist in after hooks
      message: { type: String },
      proofItems: [Item],
      messageContext: { type: String },
      token: { type: Token },
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
