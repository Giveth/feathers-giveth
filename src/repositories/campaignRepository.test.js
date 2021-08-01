const request = require('supertest');
const { assert } = require('chai');
const config = require('config');
const { findCampaignByGivethIoProjectId } = require('./campaignRepository');
const { getFeatherAppInstance } = require('../app');
const { getJwt, SAMPLE_DATA } = require('../../test/testUtility');

let app;

before(() => {
  app = getFeatherAppInstance();
});

const baseUrl = config.get('givethFathersBaseUrl');
const relativeUrl = '/campaigns';

async function createCampaign(data) {
  const response = await request(baseUrl)
    .post(relativeUrl)
    .send(data)
    .set({ Authorization: getJwt() });
  return response.body;
}

function findCampaignByGivethIoProjectIdTestCases() {
  it('should found campaign with givethIoProjectId', async () => {
    const givethIoProjectId = "10";
    const campaign = await createCampaign({
      ...SAMPLE_DATA.CREATE_CAMPAIGN_DATA,
      givethIoProjectId,
    });
    assert.equal(campaign.givethIoProjectId, givethIoProjectId);
    const foundCampaign = await findCampaignByGivethIoProjectId(app, givethIoProjectId);
    assert.equal(campaign._id, foundCampaign._id);
  });
}

describe(`findCampaignByGivethIoProjectId test cases`, findCampaignByGivethIoProjectIdTestCases);
