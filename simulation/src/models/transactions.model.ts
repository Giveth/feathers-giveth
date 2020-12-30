import { Document, model, Schema, Types } from 'mongoose';

export interface TransactionMongooseDocument extends Document{
  hash:string,
  from:string,
  blockNumber:number,
  isHome:boolean,
  timestamp:Date,
}

const transaction = new Schema(
  {
    hash: { type: String, required: true, index: true },
    from: { type: String, required: true },
    blockNumber: { type: Number },
    isHome: { type: Boolean, default: false },
    timestamp: { type: Date },
  },
  {
    timestamps: false,
  },
);

export const transactionModel = model<TransactionMongooseDocument>('transactions', transaction);
