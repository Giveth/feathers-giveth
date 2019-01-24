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
      description: { type: String, required: true },
      projectId: { type: Schema.Types.Long, index: true }, // we can use Long here b/c lp only stores adminId in pledges as uint64
      image: { type: String, required: true },
      txHash: { type: String, index: true, required: true },
      peopleCount: { type: Number },
      donationCounters: [DonationCounter],
      dacs: { type: [String] },
      reviewerAddress: { type: String, required: true, index: true },
      ownerAddress: { type: String, required: true, index: true },
      pluginAddress: { type: String },
      tokenAddress: { type: String },
      mined: { type: Boolean, required: true, default: false },
      status: {
        type: String,
        require: true,
        enum: Object.values(CampaignStatus),
        default: CampaignStatus.PENDING,
      },
      url: { type: String },
      commitTime: { type: Number },
      communityUrl: { type: String },
    },
    {
      timestamps: true,
    },
  );

  return mongooseClient.model('campaign', campaign);
}

module.exports = {
  CampaignStatus,
  createModel,
};
