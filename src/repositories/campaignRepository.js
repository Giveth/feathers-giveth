const findVerifiedCampaigns = async app => {
  const campaignsService = app.service('campaigns');
  const campaignsModel = campaignsService.Model;
  return campaignsModel.find({ verified: true });
};

module.exports = {
  findVerifiedCampaigns,
};
