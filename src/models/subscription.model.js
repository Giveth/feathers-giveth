const PROJECT_TYPE = {
  CAMPAIGN: 'campaign',
  DAC: 'dac',
  MILESTONE: 'milestone',
};

function createModel(app) {
  const mongooseClient = app.get('mongooseClient');
  const { Schema } = mongooseClient;
  const subscription = new Schema(
    {
      userAddress: { type: String, required: true },
      projectType: { type: String, required: true, enum: Object.values(PROJECT_TYPE) },
      projectTypeId: { type: String, required: true },
      projectId: { type: String },
      enabled: { type: Boolean, default: false },
    },
    {
      timestamps: true,
    },
  );
  subscription.index({ userAddress: 1, projectTypeId: 1 });
  subscription.index({ userAddress: 1, projectId: 1 });

  return mongooseClient.model('subscription', subscription);
}

module.exports = {
  PROJECT_TYPE,
  createModel,
};
