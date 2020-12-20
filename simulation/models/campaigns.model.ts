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
    status: {
      type: String,
      require: true,
      enum: Object.values(CampaignStatus),
      default: CampaignStatus.PENDING,
    },
  },
  {
    timestamps: true,
  },
);
export const campaignModel = model<CampaignMongooseDocument>('campaign', campaign);

