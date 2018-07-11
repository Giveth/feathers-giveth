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
      id: { type: String, required: true, index: true, unique: true },
      type: {
        type: String,
        required: true,
        index: true,
        enum: Object.values(AdminTypes),
      },
      typeId: { type: String }, // --> TO DO: This should be an ObjectID
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
