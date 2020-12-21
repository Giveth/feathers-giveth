import { Document, model, Schema, Types } from 'mongoose';

export interface TransactionMongooseDocument extends Document{
  hash:string,
  from:string,
}

const transaction = new Schema(
  {
    hash: { type: String, required: true, index: true },
    from: { type: String, required: true },
    isHome: { type: Boolean, default: false },
  },
  {
    timestamps: false,
  },
);

export const transactionModel = model<TransactionMongooseDocument>('transactions', transaction);
