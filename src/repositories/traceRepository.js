const { findVerifiedCampaigns, findUnVerifiedCampaigns } = require('./campaignRepository');

const findVerifiedTraces = async app => {
  const tracesService = app.service('traces');
  const tracesModel = tracesService.Model;
  const verifiedCampaigns = await findVerifiedCampaigns(app);
  return tracesModel.find({
    projectId: { $nin: [0, -1, null] },
    $or: [
      { verified: true },
      { campaignId: { $in: verifiedCampaigns.map(campaign => String(campaign._id)) } },
    ],
  });
};
const findUnVerifiedTraces = async app => {
  const tracesService = app.service('traces');
  const tracesModel = tracesService.Model;
  const unVerifiedCampaigns = await findUnVerifiedCampaigns(app);
  return tracesModel.find({
    projectId: { $nin: [0, -1, null] },
    verified: false,
    campaignId: { $in: unVerifiedCampaigns.map(campaign => String(campaign._id)) },
  });
};

module.exports = {
  findVerifiedTraces,
  findUnVerifiedTraces,
};
