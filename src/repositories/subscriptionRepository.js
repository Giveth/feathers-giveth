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
const findProjectSubscribers = async (app, { projectTypeId }) => {
  const subscribeService = app.service('subscriptions');
  const subscriptionModel = subscribeService.Model;
  return subscriptionModel.aggregate([
    {
      $match: {
        projectTypeId,
        enabled: true,
      },
    },
    {
      $lookup: {
        from: 'users',
        let: { userAddress: '$userAddress' },
        pipeline: [
          {
            $match: {
              email: { $exists: true },
              $expr: {
                $eq: ['$address', '$$userAddress'],
              },
            },
          },
        ],
        as: 'user',
      },
    },
    {
      $unwind: '$user',
    },
  ]);
};

/**
 * This function return all users that subscribe campaign's parent dac
 * @param app : feather instance
 * @param campaignId
 * @returns {Promise<[
  {
    "_id": {"$oid": "604d025bf3084e6a0bae608c"},
    "__v": 0,
    "campaigns": ["604d025bf3084e6a0bae608c"],
    "createdAt": {"$date": "2021-03-13T18:20:11.155Z"},
    "description": "test dac description",
    "donationCounters": [],
    "ownerAddress": "0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1",
    "slug": "test-dac-title",
    "status": "Pending",
    "subscriptions": [
      {
        "_id": {"$oid": "604d025bf3084e6a0bae608d"},
        "enabled": true,
        "userAddress": "0x28F12d62B5D42ecEf69eAb668A79DD79D762f1cD",
        "projectType": "dac",
        "projectTypeId": "604d025bf3084e6a0bae608c",
        "createdAt": {"$date": "2021-03-13T18:20:11.182Z"},
        "updatedAt": {"$date": "2021-03-13T18:20:11.182Z"},
        "__v": 0,
        "user": {
          "_id": {"$oid": "604d025bf3084e6a0bae608b"},
          "isReviewer": false,
          "isDelegator": false,
          "isProjectOwner": false,
          "isAdmin": true,
          "address": "0x28F12d62B5D42ecEf69eAb668A79DD79D762f1cD",
          "email": "1615659611075-dacSubscriber@test.giveth",
          "name": "dac subscriber Sat Mar 13 2021 21:50:11 GMT+0330 (Iran Standard Time)",
          "createdAt": {"$date": "2021-03-13T18:20:11.076Z"},
          "updatedAt": {"$date": "2021-03-13T18:20:11.076Z"},
          "__v": 0
        }
      }
    ],
    "title": "test dac title",
    "txHash": "0xe2a9dcb6789479a3f53bd3de900dc0106ecef348b520bdc3c55bf91492641f",
    "updatedAt": {"$date": "2021-03-13T18:20:11.155Z"}
  }
]>}
 */
const findParentDacSubscribersForCampaign = async (app, { campaignId }) => {
  const dacService = app.service('dacs');
  const dacModel = dacService.Model;
  return dacModel.aggregate([
    {
      $match: {
        campaigns: campaignId,
      },
    },
    {
      $lookup: {
        let: {
          dacId: {
            $toString: '$_id',
          },
        },
        from: 'subscriptions',
        pipeline: [
          {
            $match: {
              enabled: true,
              $expr: {
                $eq: ['$projectTypeId', '$$dacId'],
              },
            },
          },
          {
            $lookup: {
              from: 'users',
              let: { userAddress: '$userAddress' },
              pipeline: [
                {
                  $match: {
                    email: { $exists: true },
                    $expr: {
                      $eq: ['$address', '$$userAddress'],
                    },
                  },
                },
              ],
              as: 'user',
            },
          },
          {
            $unwind: '$user',
          },
        ],
        as: 'subscriptions',
      },
    },
  ]);
};

module.exports = {
  updateSubscriptionProject,
  findProjectSubscribers,
  findParentDacSubscribersForCampaign,
};
