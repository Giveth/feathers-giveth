const updateSubscriptionProject = async (
  app,
  { projectTypeId, enabled, projectType, userAddress, projectId },
) => {
  const subscribeService = app.service('subscriptions');
  const subscriptionModel = subscribeService.Model;
  return subscriptionModel.findOneAndUpdate(
    { projectTypeId, projectType, userAddress },
    { enabled, projectTypeId, projectType, userAddress, projectId },
    {
      new: true,
      upsert: true,
    },
  );
};

module.exports = {
  updateSubscriptionProject,
};
