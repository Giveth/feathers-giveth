// pledgeAdmins-model.js - A mongoose model
//
// See http://mongoosejs.com/docs/models.html
// for more of what you can do here.
const AdminTypes = {
  GIVER: 'giver',
  DAC: 'dac',
  CAMPAIGN: 'campaign',
  MILESTONE: 'milestone',
};

function PledgeAdmin(app) {
  const mongooseClient = app.get('mongooseClient');
  const { Schema } = mongooseClient;
  const pledgeAdmin = new Schema(
    {
      id: { type: Schema.Types.Long, required: true, index: true, unique: true }, // we can use Long here b/c lp only stores adminId in pledges as uint64
      type: {
        type: String,
        required: true,
        index: true,
        enum: Object.values(AdminTypes),
      },
      typeId: { type: String },
    },
    {
      timestamps: true,
    },
  );

  return mongooseClient.model('pledgeAdmin', pledgeAdmin);
}

module.exports = {
  createModel: PledgeAdmin,
  AdminTypes,
};
