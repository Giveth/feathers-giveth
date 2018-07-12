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
  REJECTED: 'Rejected',
  FAILED: 'Failed',
};

function Donation(app) {
  const mongooseClient = app.get('mongooseClient');
  const { Schema } = mongooseClient;
  const donation = new Schema(
    {
      giverAddress: { type: String, required: true, index: true },
      amount: { type: Schema.Types.Long, required: true },
      amountRemaining: { type: Schema.Types.Long, required: true },
      pledgeId: { type: Schema.Types.Long, required: true },
      ownerId: { type: Schema.Types.Long, required: true },
      ownerTypeId: { type: String },
      ownerType: { type: String, required: true },
      intendedProjectId: { type: Schema.Types.Long },
      intendedProjectTypeId: { type: String },
      intendedProjectType: { type: String },
      delegateId: { type: Schema.Types.Long },
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
