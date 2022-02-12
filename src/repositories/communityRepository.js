const findParentCommunities = async (app, { campaignId }) => {
  const communityService = app.service('communities');
  const communityModel = communityService.Model;

  // This query find all communities that have campaignId in their campaigns array
  return communityModel.find({ campaigns: campaignId });
};

const findVerifiedCommunities = async app => {
  const communityService = app.service('communities');
  const communityModel = communityService.Model;
  return communityModel.find({ verified: true });
};
const findUnVerifiedCommunities = async app => {
  const communityService = app.service('communities');
  const communityModel = communityService.Model;
  return communityModel.find({ verified: false });
};

module.exports = {
  findParentCommunities,
  findVerifiedCommunities,
  findUnVerifiedCommunities
};
