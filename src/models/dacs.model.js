const DonationCounter = require('./donationCounter.model');

const DacStatus = {
  ACTIVE: 'Active',
  PENDING: 'Pending',
  CANCELED: 'Canceled',
  FAILED: 'Failed',
};

// dacs-model.js - A mongoose model
//
// See http://mongoosejs.com/docs/models.html
// for more of what you can do here.
function createModel(app) {
  const mongooseClient = app.get('mongooseClient');
  const { Schema } = mongooseClient;
  const dac = new Schema(
    // TODO note: the following commenting out of required is b/c
    // if a dac is added to lp not from the dapp, we can't
    // guarantee that those fields are present until we have
    // ipfs enabled
    {
      title: { type: String, required: true },
      description: { type: String, required: true },
      communityUrl: { type: String },
      // FIXME: Should be unique but since we are using 0 for new DACs there can be more than one pending... Should instead be undefined
      delegateId: { type: Schema.Types.Long }, // we can use Long here b/c lp only stores adminId in pledges as uint64
      status: {
        type: String,
        require: true,
        enum: Object.values(DacStatus),
        default: DacStatus.PENDING,
      },
      image: { type: String },
      prevImage: { type: String }, // To store deleted/cleared lost ipfs values
      txHash: { type: String, required: true },
      donationCounters: [DonationCounter],
      peopleCount: { type: Number },
      ownerAddress: { type: String, required: true },
      pluginAddress: { type: String },
      tokenAddress: { type: String },
      commitTime: { type: Number },
      campaigns: { type: [String], default: [] },
      mined: { type: Boolean },
      url: { type: String },
      customThanksMessage: { type: String },
      prevUrl: { type: String }, // To store deleted/cleared lost ipfs values
    },
    {
      timestamps: true,
    },
  );
  dac.index({ createdAt: 1 });
  dac.index({ status: 1, createdAt: 1 });
  dac.index({ ownerAddress: 1, createdAt: 1 });
  dac.index({ delegateId: 1, ownerAddress: 1 });
  return mongooseClient.model('dac', dac);
}

module.exports = {
  DacStatus,
  createModel,
};
