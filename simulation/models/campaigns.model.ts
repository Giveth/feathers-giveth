import { Document, model, Schema, Types } from 'mongoose';

import DonationCounter from './donationCounter.model';

export const CampaignStatus = {
  ACTIVE: 'Active',
  PENDING: 'Pending',
  CANCELED: 'Canceled',
  FAILED: 'Failed',
};

interface CampaignMongooseDocument extends  Document {
  title:string,
  status: string
}

const campaign = new Schema(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    projectId: { type: Number, index: true }, // we can use Long here b/c lp only stores adminId in pledges as uint64
    image: { type: String, required: true },
    prevImage: { type: String }, // To store deleted/cleared lost ipfs values
    txHash: { type: String, index: true, required: true },
    peopleCount: { type: Number },
    donationCounters: [DonationCounter],
    dacs: { type: [String] },
    reviewerAddress: { type: String, required: true, index: true },
    ownerAddress: { type: String, required: true, index: true },
    coownerAddress: { type: String, required: false, index: true },
    fundsForwarder: { type: String, required: false, index: true },
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
    customThanksMessage: { type: String },
    prevUrl: { type: String }, // To store deleted/cleared lost ipfs values
    commitTime: { type: Number },
    communityUrl: { type: String },
    archivedMilestones: { type: [Number] },
  },
  {
    timestamps: true,
  },
);
export const campaignModel = model<CampaignMongooseDocument>('campaign', campaign);

