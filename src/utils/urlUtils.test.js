const { assert } = require('chai');
const config = require('config');
const { getTraceUrl, getCampaignUrl, getCommunityUrl } = require('./urlUtils');
const { generateRandomMongoId } = require('../../test/testUtility');

describe('getTraceUrl() test cases', () => {
  it('should return traceUrl', () => {
    const traceId = generateRandomMongoId();
    const campaignId = generateRandomMongoId();
    const traceUrl = getTraceUrl({ _id: traceId, campaignId });
    assert.equal(traceUrl, `${config.dappUrl}/campaigns/${campaignId}/traces/${traceId}`);
  });
});

describe('getCampaignUrl() test cases', () => {
  it('should return traceUrl', () => {
    const campaignId = generateRandomMongoId();
    const campaignUrl = getCampaignUrl({ _id: campaignId });
    assert.equal(campaignUrl, `${config.dappUrl}/campaigns/${campaignId}`);
  });
});

describe('getCommunityUrl() test cases', () => {
  it('should return traceUrl', () => {
    const communityId = generateRandomMongoId();
    const communityUrl = getCommunityUrl({ _id: communityId });
    assert.equal(communityUrl, `${config.dappUrl}/communities/${communityId}`);
  });
});
