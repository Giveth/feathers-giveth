import { Document, model, Schema, Types } from 'mongoose';

// donations-model.js - A mongoose model
//
// See http://mongoosejs.com/docs/models.html
// for more of what you can do here.

export const DonationStatus = {
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


interface DonationMongooseDocument extends  Document {
  txHash:string,
  createdAt:Date,
  amount :string,
  amountRemaining:string,
  pledgeId:string,
  status:string,
  mined:boolean,
  parentDonations: [string],
  ownerId: number,
  ownerType :string,
  ownerTypeId :string,
  intendedProjectId : number,
  giverAddress: string,
  tokenAddress:string,
  isReturn :boolean,
  usdValue:number,
}



const donation = new Schema(
  {
    giverAddress: { type: String, required: true, index: true },
    actionTakerAddress: { type: String },
    amount: { type: String, required: true, min: 0 },
    amountRemaining: { type: String, required: true, min: 0 },
    pendingAmountRemaining: { type: String, min: 0 },
    pledgeId: { type: String, required: true },
    paymentId: { type: String },
    canceledPledgeId: { type: String },
    ownerId: { type: Number, required: true }, // we can use Long here b/c lp only stores adminId in pledges as uint64
    ownerTypeId: { type: String, required: true, index: true },
    ownerType: { type: String, required: true },
    intendedProjectId: { type: Number }, // we can use Long here b/c lp only stores adminId in pledges as uint64
    intendedProjectTypeId: { type: String },
    intendedProjectType: { type: String },
    delegateId: { type: Number }, // we can use Long here b/c lp only stores adminId in pledges as uint64
    delegateTypeId: { type: String },
    delegateType: { type: String },
    campaignId: { type: String },
    status: {
      type: String,
      require: true,
      enum: Object.values(DonationStatus),
      default: DonationStatus.PENDING,
      index: true,
    },
    txHash: { type: String, index: true },
    homeTxHash: { type: String },
    commitTime: { type: Date },
    mined: { type: Boolean, default: false, required: true, index: true },
    parentDonations: { type: [String], default: [], required: true },
    isReturn: { type: Boolean, default: false },
    tokenAddress: { type: String, required: true },
    lessThanCutoff: { type: Boolean, default: false },
    usdValue: { type: Number, default: 0 },
    txNonce: { type: Number },
    comment: { type: String },
  },
  {
    timestamps: true,
  },
);

export const donationModel = model<DonationMongooseDocument>('donations', donation);

