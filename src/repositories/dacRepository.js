const findParentDacs = async (app, { campaignId }) => {
  const dacService = app.service('dacs');
  const dacModel = dacService.Model;

  // This query find all dacs that have campaignId in their campaigns array
  return dacModel.find({ campaigns: campaignId });
};

module.exports = {
  findParentDacs,
};
