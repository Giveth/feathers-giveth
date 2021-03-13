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


/**
 * This function return all users that subscribe a project and have emails
 * @param app : feather instance
 * @param projectTypeId : dacId, campaignId or milestoneId
 * @returns {Promise<*>}
 */
const findProjectSubscribers = async (
  app,
  { projectTypeId },
) => {
  const subscribeService = app.service('subscriptions');
  const subscriptionModel = subscribeService.Model;
  return subscriptionModel.aggregate([
      {
        $match :{
          projectTypeId,
          enabled:true
        }
      } ,
      {
        $lookup:{
          from:'users',
          let: {userAddress: "$userAddress"},
          pipeline: [
            {
              $match: {
                email:{$exists:true},
                $expr: {
                  $eq: ["$address", "$$userAddress"]
                },
              }
            }
          ],
          as: "user"
        }
      }
      ,
      {
        $unwind: '$user'
      }
    ]
  )
};


module.exports = {
  updateSubscriptionProject,
  findProjectSubscribers
};
