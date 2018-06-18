// ethconversion-model.js - A mongoose model
// 
// See http://mongoosejs.com/docs/models.html
// for more of what you can do here.
module.exports = function (app) {
  const mongooseClient = app.get('mongooseClient');
  const { Schema } = mongooseClient;
  const ethconversion = new Schema({
    timestamp: { type: Date, required: true, index: true, unique: true },
    rates: { type: Object },
  }, {
    timestamps: true
  });

  return mongooseClient.model('ethconversion', ethconversion);
};
