// donations-model.js - A mongoose model
//
// See http://mongoosejs.com/docs/models.html
// for more of what you can do here.

const DonationStatus = {
  PENDING: 'Pending',
  PAYING: 'Paying',
  PAID: 'Paid',
  TO_APPROVE: 'ToApprove',
  WAITING: 'Waiting',
  COMMITTED: 'Committed',
  CANCELED: 'Canceled',
  REJECTED: 'Rejected',
  FAILED: 'Failed',
};

function Donation(app) {
  const mongooseClient = app.get('mongooseClient');
  const { Schema } = mongooseClient;
  const donation = new Schema(
    {
      giverAddress: { type: String, required: true, index: true },
      amount: { type: Schema.Types.BN, required: true, min: 0 },
      amountRemaining: { type: Schema.Types.BN, required: true, min: 0 },
      pledgeId: { type: Schema.Types.BN, required: true },
      paymentId: { type: Schema.Types.BN },
      canceledPledgeId: { type: Schema.Types.BN },
      ownerId: { type: Schema.Types.Long, required: true }, // we can use Long here b/c lp only stores adminId in pledges as uint64
      ownerTypeId: { type: String, required: true },
      ownerType: { type: String, required: true },
      intendedProjectId: { type: Schema.Types.Long }, // we can use Long here b/c lp only stores adminId in pledges as uint64
      intendedProjectTypeId: { type: String },
      intendedProjectType: { type: String },
      delegateId: { type: Schema.Types.Long }, // we can use Long here b/c lp only stores adminId in pledges as uint64
      delegateTypeId: { type: String },
      delegateType: { type: String },
      status: {
        type: String,
        require: true,
        enum: Object.values(DonationStatus),
        default: DonationStatus.PENDING,
      },
      txHash: { type: String, index: true },
      commitTime: { type: Date },
      mined: { type: Boolean },
      previousState: { type: Object },
      parentDonations: { type: [String], default: [], required: true },
      isReturn: { type: Boolean, default: false },
    },
    {
      timestamps: true,
    },
  );

  return mongooseClient.model('donations', donation);
}

module.exports = {
  DonationStatus,
  createModel: Donation,
};
