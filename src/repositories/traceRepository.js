const { findVerifiedCampaigns } = require('./campaignRepository');

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

const findTraceByQuery = async (app, query) => {
  const tracesService = app.service('traces');
  const tracesModel = tracesService.Model;
  return tracesModel.find(query);
};

module.exports = {
  findVerifiedTraces,
  findTraceByQuery,
};
