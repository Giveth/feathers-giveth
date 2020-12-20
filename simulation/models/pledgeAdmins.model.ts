import {Document, model, Schema, Types} from "mongoose";
export const AdminTypes = {
  GIVER: 'giver',
  DAC: 'dac',
  CAMPAIGN: 'campaign',
  MILESTONE: 'milestone',
};


interface PledgeAdminMongooseDocument extends Document {
  type:string,
  typeId:string
}


const pledgeAdmin = new Schema(
  {
    id: { type: Number, required: true, index: true, unique: true }, // we can use Long here b/c lp only stores adminId in pledges as uint64
    type: {
      type: String,
      required: true,
      enum: Object.values(AdminTypes),
    },
    typeId: { type: String },
  },
  {
    timestamps: true,
  },
);
export const pledgeAdminModel = model<PledgeAdminMongooseDocument>('pledgeAdmin', pledgeAdmin);

