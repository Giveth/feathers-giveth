import {Document, model, Schema, Types} from "mongoose";


const DonationCounter = new Schema({
  name: { type: String, required: true },
  address: { type: String, required: true },
  decimals: { type: String, required: true },
  symbol: { type: String, required: true },
  totalDonated: { type: String, min: 0 },
  currentBalance: { type: String, min: 0 },
  donationCount: { type: Number },
});

export default  DonationCounter;
