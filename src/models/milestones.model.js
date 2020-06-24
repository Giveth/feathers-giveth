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
  ARCHIVED: 'Archived',
};

const MilestoneTypes = {
  LPPCappedMilestone: 'LPPCappedMilestone',
  BridgedMilestone: 'BridgedMilestone',
  LPMilestone: 'LPMilestone',
};

function Milestone(app) {
  const mongooseClient = app.get('mongooseClient');
  const { Schema } = mongooseClient;

  const milestone = new Schema(
    {
      title: { type: String, required: true },
      description: { type: String, required: true },
      image: { type: String },
      prevImage: { type: String }, // To store deleted/cleared lost ipfs values
      maxAmount: { type: Schema.Types.BN },
      ownerAddress: { type: String, required: true, index: true },
      reviewerAddress: { type: String, index: true },
      dacId: { type: Number, index: true },
      recipientAddress: { type: String, index: true },
      recipientId: { type: Schema.Types.Long, index: true }, // we can use Long here b/c lp only stores adminId in pledges as uint64
      pendingRecipientAddress: { type: String },
      campaignReviewerAddress: { type: String, index: true },
      campaignId: { type: String, required: true, index: true },
      projectId: { type: Schema.Types.Long, index: true }, // we can use Long here b/c lp only stores adminId in pledges as uint64
      status: {
        type: String,
        require: true,
        enum: Object.values(MilestoneStatus),
      },
      items: [Item],
      conversionRateTimestamp: { type: Date },
      selectedFiatType: { type: String },
      date: { type: Date, required: true },
      fiatAmount: { type: Number },
      conversionRate: { type: Number },
      txHash: { type: String, index: true },
      pluginAddress: { type: String },
      fullyFunded: { type: Boolean, default: false },
      donationCounters: [DonationCounter],
      peopleCount: { type: Number },
      mined: { type: Boolean, required: true, default: false },
      prevStatus: { type: String },
      url: { type: String },
      prevUrl: { type: String }, // To store deleted/cleared lost ipfs values
      type: {
        type: String,
        required: true,
        enum: Object.values(MilestoneTypes),
      },

      // these 2 fields should not be stored in mongo
      // but we need them for temporary storage
      // as mongoose virtuals do not persist in after hooks
      message: { type: String },
      proofItems: [Item],
      messageContext: { type: String },
      token: { type: Token, required: true },
      projectAddedAt: { type: Date }, // Store the time milestone is accepted or added by campaign owner
    },
    {
      timestamps: true,
    },
  );

  return mongooseClient.model('milestone', milestone);
}

module.exports = {
  MilestoneStatus,
  MilestoneTypes,
  createModel: Milestone,
};
