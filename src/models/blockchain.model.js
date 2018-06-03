// blockchain-model.js - A mongoose model
// 
// See http://mongoosejs.com/docs/models.html
// for more of what you can do here.
module.exports = function (app) {
  const mongooseClient = app.get('mongooseClient');
  const { Schema } = mongooseClient;
  const blockchain = new Schema({
    lastBLock: { type: Number, required: true }
  }, {
    timestamps: true
  });

  return mongooseClient.model('blockchain', blockchain);
};
