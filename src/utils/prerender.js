const as = require('async');
const axios = require('axios');

const PRERENDER_ENDPOINT = 'https://api.prerender.io/recache';
const PRERENDER_TOKEN = 'TE1yUtRPGJynVFxtyS2Y';

const invalidateCache = url => {
  return axios
    .post(PRERENDER_ENDPOINT, {
      prerenderToken: PRERENDER_TOKEN,
      url,
    })
    .then(res => {
      return res.status === 200;
    });
};
function Prerender(givethBaseUrl) {
  const q = as.queue((url, cb) => {
    invalidateCache(url)
      .then(res => {
        if (res) {
          cb();
        } else {
          cb('incalidate cache error');
        }
      })
      .catch(err => {
        cb(err);
      });
  });
  this.invalidateCacheForDac = dacId => {
    q.push(`${givethBaseUrl}/dacs/${dacId}`);
  };
  this.invalidateCacheForCampaign = campaignId => {
    q.push(`${givethBaseUrl}/campaigns/${campaignId}`);
  };
  this.invalidateCacheForMilestone = milestoneId => {
    q.push(`${givethBaseUrl}/milestones/${milestoneId}`);
  };
  this.invalidateCacheForHomepage = () => {
    q.push(givethBaseUrl);
  };
}
module.exports = Prerender;
