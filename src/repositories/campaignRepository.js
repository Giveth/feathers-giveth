const findVerifiedCampaigns = async app => {
  const campaignsService = app.service('campaigns');
  const campaignsModel = campaignsService.Model;
  return campaignsModel.find({ verified: true });
};

const findUnVerifiedCampaigns = async app => {
  const campaignsService = app.service('campaigns');
  const campaignsModel = campaignsService.Model;
  return campaignsModel.find({ verified: false });
};

const findCampaignByGivethIoProjectId = async (app, givethIoProjectId) => {
  const campaignsService = app.service('campaigns');
  const campaignsModel = campaignsService.Model;
  return campaignsModel.findOne({ givethIoProjectId });
};

module.exports = {
  findVerifiedCampaigns,
  findCampaignByGivethIoProjectId,
  findUnVerifiedCampaigns,
};
