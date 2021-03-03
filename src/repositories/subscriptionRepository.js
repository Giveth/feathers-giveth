const updateSubscriptionProject = async (
  app,
  { projectTypeId, enabled, projectType, userAddress },
) => {
  const subscribeService = app.service('subscriptions');
  const subscriptionModel = subscribeService.Model;
  return subscriptionModel.findOneAndUpdate(
    { projectTypeId, userAddress },
    { enabled, projectTypeId, projectType, userAddress },
    {
      new: true,
      upsert: true,
    },
  );
};

module.exports = {
  updateSubscriptionProject,
};
