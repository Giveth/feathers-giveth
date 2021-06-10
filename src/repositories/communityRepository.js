const findParentCommunities = async (app, { campaignId }) => {
  const communityService = app.service('communities');
  const communityModel = communityService.Model;

  // This query find all communities that have campaignId in their campaigns array
  return communityModel.find({ campaigns: campaignId });
};

module.exports = {
  findParentCommunities,
};
