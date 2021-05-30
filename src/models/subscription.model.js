const ProjectTypes = {
  CAMPAIGN: 'campaign',
  COMMUNITY: 'community',
  MILESTONE: 'milestone',
};

function createModel(app) {
  const mongooseClient = app.get('mongooseClient');
  const { Schema } = mongooseClient;
  const subscription = new Schema(
    {
      userAddress: { type: String, required: true },
      projectType: { type: String, required: true, enum: Object.values(ProjectTypes) },
      projectTypeId: { type: String, required: true },
      enabled: { type: Boolean, default: false },
    },
    {
      timestamps: true,
    },
  );
  subscription.index({ userAddress: 1, projectTypeId: 1, enabled: 1 });

  return mongooseClient.model('subscription', subscription);
}

module.exports = {
  ProjectTypes,
  createModel,
};
