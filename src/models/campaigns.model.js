const DonationCounter = require('./donationCounter.model');

const CampaignStatus = {
  ACTIVE: 'Active',
  PENDING: 'Pending',
  CANCELED: 'Canceled',
  FAILED: 'Failed',
};

// campaigns-model.js - A mongoose model
//
// See http://mongoosejs.com/docs/models.html
// for more of what you can do here.
function createModel(app) {
  const mongooseClient = app.get('mongooseClient');
  const { Schema } = mongooseClient;
  const campaign = new Schema(
    {
      title: { type: String, required: true },
      slug: { type: String, required: true },
      description: { type: String, required: true },
      projectId: { type: Schema.Types.Long, index: true }, // we can use Long here b/c lp only stores adminId in pledges as uint64
      image: { type: String, required: true },
      prevImage: { type: String }, // To store deleted/cleared lost ipfs values
      txHash: { type: String, index: true, required: true },
      peopleCount: { type: Number },
      donationCounters: [DonationCounter],
      communities: { type: [String] },
      reviewerAddress: { type: String, required: true, index: true },
      ownerAddress: { type: String, required: true, index: true },
      coownerAddress: { type: String, required: false, index: true },
      disableDonate: { type: Boolean, required: false, default: false },
      fundsForwarder: { type: String, required: false, index: true },
      pluginAddress: { type: String },
      tokenAddress: { type: String },
      mined: { type: Boolean, required: true, default: false },
      verified: { type: Boolean, default: false },
      status: {
        type: String,
        require: true,
        enum: Object.values(CampaignStatus),
        default: CampaignStatus.PENDING,
      },
      url: { type: String },
      customThanksMessage: { type: String },
      prevUrl: { type: String }, // To store deleted/cleared lost ipfs values
      commitTime: { type: Number },
      communityUrl: { type: String },
      archivedTraces: { type: [Schema.Types.Long] },
      gasPaidUsdValue: { type: Number, default: 0 },
    },
    {
      timestamps: true,
    },
  );

  campaign.index({ campaignId: 1, projectId: 1 });
  campaign.index({ createdAt: 1, status: 1 });
  campaign.index({ updatedAt: 1, projectId: 1, status: 1 });
  campaign.index({
    createdAt: 1,
    ownerAddress: 1,
    reviewerAddress: 1,
    coownerAddress: 1,
  });
  campaign.index({ slug: 1 }, { unique: true });
  return mongooseClient.model('campaign', campaign);
}

module.exports = {
  CampaignStatus,
  createModel,
};
