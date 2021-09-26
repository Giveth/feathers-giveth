const request = require('supertest');
const { assert } = require('chai');
const config = require('config');
const { findCampaignByGivethIoProjectId, findCampaignBySlug } = require('./campaignRepository');
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
    .set({ Authorization: getJwt(data.ownerAddress) });
  return response.body;
}

function findCampaignByGivethIoProjectIdTestCases() {
  it('should found campaign with givethIoProjectId', async () => {
    const givethIoProjectId = '10';
    const campaign = await createCampaign({
      ...SAMPLE_DATA.CREATE_CAMPAIGN_DATA,
      givethIoProjectId,
    });
    assert.equal(campaign.givethIoProjectId, givethIoProjectId);
    const foundCampaign = await findCampaignByGivethIoProjectId(app, givethIoProjectId);
    assert.equal(campaign._id, foundCampaign._id);
  });
}

function findCampaignBySlugTestCases() {
  it('should return campaign', async () => {
    const campaign = await createCampaign(SAMPLE_DATA.CREATE_CAMPAIGN_DATA);
    const { slug } = campaign;
    const result = await findCampaignBySlug(app, slug);
    assert.isOk(result);
    assert.equal(campaign._id, result._id);
  });

  it('should not find data', async () => {
    const slug = new Date();
    const result = await findCampaignBySlug(app, slug);
    assert.notOk(result);
  });
}

describe(`findCampaignByGivethIoProjectId test cases`, findCampaignByGivethIoProjectIdTestCases);
describe(`findCampaignBySlug test cases`, findCampaignBySlugTestCases);
