const Item = require('./item.model');
const DonationCounter = require('./donationCounter.model');

// traces-model.js - A mongoose model
//
// See http://mongoosejs.com/docs/models.html
// for more of what you can do here.
const TraceStatus = {
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

const TraceTypes = {
  LPPCappedMilestone: 'LPPCappedMilestone',
  BridgedMilestone: 'BridgedMilestone',
  LPMilestone: 'LPMilestone',
};

const TraceFormTypes = {
  BOUNTY: 'bounty',
  PAYMENT: 'payment',
  EXPENSE: 'expense',
  Milestone: 'milestone',
};

function Milestone(app) {
  const mongooseClient = app.get('mongooseClient');
  const { Schema } = mongooseClient;

  const trace = new Schema(
    {
      title: { type: String, required: true },
      slug: { type: String, required: true },
      description: { type: String, required: true },
      image: { type: String },
      prevImage: { type: String }, // To store deleted/cleared lost ipfs values
      maxAmount: { type: Schema.Types.BN },
      ownerAddress: { type: String, required: true },
      reviewerAddress: { type: String },
      dacId: { type: Number },
      recipientAddress: { type: String },
      recipientId: { type: Schema.Types.Long }, // we can use Long here b/c lp only stores adminId in pledges as uint64
      pendingRecipientAddress: { type: String },
      campaignReviewerAddress: { type: String },
      campaignId: { type: String, required: true },
      projectId: { type: Schema.Types.Long }, // we can use Long here b/c lp only stores adminId in pledges as uint64
      status: {
        type: String,
        require: true,
        enum: Object.values(TraceStatus),
      },
      formType: {
        type: String,
        enum: Object.values(TraceFormTypes),
      },
      items: [Item],
      conversionRateTimestamp: { type: Date },
      selectedFiatType: { type: String },
      date: { type: Date, required: true },
      fiatAmount: { type: Number },
      conversionRate: { type: Number },
      txHash: { type: String },
      pluginAddress: { type: String },
      fullyFunded: { type: Boolean, default: false },
      donationCounters: [DonationCounter],
      peopleCount: { type: Number },
      mined: { type: Boolean, required: true, default: false },
      prevStatus: { type: String },
      url: { type: String },
      customThanksMessage: { type: String },
      prevUrl: { type: String }, // To store deleted/cleared lost ipfs values
      type: {
        type: String,
        required: true,
        enum: Object.values(TraceTypes),
      },

      // these 2 fields should not be stored in mongo
      // but we need them for temporary storage
      // as mongoose virtuals do not persist in after hooks
      message: { type: String },
      proofItems: [Item],
      messageContext: { type: String },
      tokenAddress: { type: String, required: true },
      projectAddedAt: { type: Date }, // Store the time trace is accepted or added by campaign owner
      gasPaidUsdValue: { type: Number, default: 0 },
    },
    {
      timestamps: true,
    },
  );
  trace.index({
    title: 'text',
    description: 'text',
    ownerAddress: 'text',
    recipientAddress: 'text',
    reviewerAddress: 'text',
  });
  trace.index({ campaignId: 1, status: 1, projectAddedAt: 1 });
  trace.index({ createdAt: 1, ownerAddress: 1, reviewerAddress: 1, recipientAddress: 1 });
  trace.index({ status: 1, fullyFunded: 1, createdAt: 1 });
  trace.index({ createdAt: 1, campaignId: 1 });
  trace.index({ projectId: 1, campaignId: 1 });
  trace.index({ slug: 1 }, { unique: true });

  return mongooseClient.model('trace', trace);
}

module.exports = {
  TraceStatus,
  TraceTypes,
  createModel: Milestone,
};
