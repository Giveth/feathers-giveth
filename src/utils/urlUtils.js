const config = require('config');

const getTraceUrl = ({ _id, campaignId }) => {
  return `${config.dappUrl}/campaigns/${campaignId}/traces/${_id}`;
};
const getCampaignUrl = ({ _id }) => {
  return `${config.dappUrl}/campaigns/${_id}`;
};
const getCommunityUrl = ({ _id }) => {
  return `${config.dappUrl}/communities/${_id}`;
};

module.exports = {
  getTraceUrl,
  getCampaignUrl,
  getCommunityUrl,
};
