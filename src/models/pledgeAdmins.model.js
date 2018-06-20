// pledgeAdmins-model.js - A mongoose model
//
// See http://mongoosejs.com/docs/models.html
// for more of what you can do here.
module.exports = function PledgeAdmin(app) {
  const mongooseClient = app.get('mongooseClient');
  const { Schema } = mongooseClient;
  const pledgeAdmin = new Schema(
    {
      id: { type: Number, required: true, index: true, unique: true },
      type: { type: String, required: true, index: true },
      typeId: { type: String }, // --> TO DO: This can be a string or an Object ?!?
    },
    {
      timestamps: true,
    },
  );

  return mongooseClient.model('pledgeAdmin', pledgeAdmin);
};
