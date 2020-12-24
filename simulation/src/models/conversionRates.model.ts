import { Document, model, Schema, Types } from 'mongoose';

// conversionRates-model.js - A mongoose model
//
// See http://mongoosejs.com/docs/models.html
// for more of what you can do here.

const conversionRates = new Schema(
  {
    timestamp: { type: Date, required: true },
    rates: { type: Object },
    symbol: { type: String, required: true },
  },
  {
    timestamps: true,
  },
);

export const converionRateModel = model('conversionRates', conversionRates);
