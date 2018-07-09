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
  FAILED: 'Failed',
};

const PaymentStatus = {
  PLEDGED: 'Pledged',
  PAYING: 'Paying',
  PAID: 'Paid',
};

function Donation(app) {
  const mongooseClient = app.get('mongooseClient');
  const { Schema } = mongooseClient;
  const donation = new Schema(
    {
      giverAddress: { type: String, required: true, index: true },
      amount: { type: String, required: true },
      pledgeId: { type: String, required: true },
      owner: { type: String, required: true },
      ownerId: { type: String },
      ownerType: { type: String, required: true },
      intendedProject: { type: String },
      intendedProjectId: { type: String },
      intendedProjectType: { type: String },
      pendingProject: { type: String },
      pendingProjectId: { type: String },
      pendingProjectType: { type: String },
      delegate: { type: String },
      delegateId: { type: String },
      delegateType: { type: String },
      status: {
        type: String,
        require: true,
        enum: Object.values(DonationStatus),
        default: DonationStatus.PENDING,
      },
      paymentStatus: {
        type: String,
        require: true,
        enum: Object.values(PaymentStatus),
        default: PaymentStatus.PLEDGED,
      },
      txHash: { type: String, index: true },
      commitTime: { type: Date },
      mined: { type: Boolean },
      requiredConfirmations: { type: Number },
      confirmations: { type: Number },
      ownerEntity: { type: String },
      giver: { type: String },
      previousState: { type: Object },
    },
    {
      timestamps: true,
    },
  );

  return mongooseClient.model('donations', donation);
}

module.exports = {
  Donation,
  DonationStatus,
  PaymentStatus,
};
