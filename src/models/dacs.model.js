export const status = {
  ACTIVE: 'Active',
  PENDING: 'Pending',
  CANCELED: 'Canceled',
  FAILED: 'Failed',
};

// dacs-model.js - A mongoose model
//
// See http://mongoosejs.com/docs/models.html
// for more of what you can do here.
export default function createModel(app) {
  const mongooseClient = app.get('mongooseClient');
  const { Schema } = mongooseClient;
  const dac = new Schema(
    // TODO note: the following commenting out of required is b/c
    // if a dac is added to lp not from the dapp, we can't
    // guarnantee that those fields are present until we have
    // ipfs enabled
    {
      title: { type: String, required: true },
      description: { type: String }, // required: true },
      communityUrl: { type: String },
      delegateId: { type: String, index: true },
      status: {
        type: String,
        require: true,
        enum: Object.values(status),
        default: status.PENDING,
      },
      image: { type: String }, // required: true },
      txHash: { type: String },
      totalDonated: { type: String },
      donationCount: { type: Number },
      ownerAddress: { type: String, required: true, index: true },
      pluginAddress: { type: String },
      tokenAddress: { type: String },
      mined: { type: Boolean },
    },
    {
      timestamps: true,
    },
  );

  return mongooseClient.model('dac', dac);
}
