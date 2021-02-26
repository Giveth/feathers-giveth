const request = require('supertest');
const config = require('config');
const { assert } = require('chai');
const { getJwt, SAMPLE_DATA } = require('../../../test/testUtility');
const { getFeatherAppInstance } = require('../../app');

const app = getFeatherAppInstance();
const baseUrl = config.get('givethFathersBaseUrl');
const relativeUrl = '/campaigncsv';

function getCampaignCsvTestCases() {
  it('should return successful result', async function() {
    const response = await request(baseUrl).get(`${relativeUrl}/${SAMPLE_DATA.CAMPAIGN_ID}`);
    assert.equal(response.statusCode, 200);
    assert.isOk(response.body);
  });
}

function postCampaignCsvTestCases() {
  it('should return 405, POST is disallowed', async function() {
    const response = await request(baseUrl)
      .post(relativeUrl)
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 405);
    assert.equal(response.body.code, 405);
  });
}

function putCampaignCsvTestCases() {
  it('should return 405, PUT is disallowed', async function() {
    const response = await request(baseUrl)
      .put(relativeUrl)
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 405);
    assert.equal(response.body.code, 405);
  });
}

function deleteCampaignCsvTestCases() {
  it('should return 405, DELETE is disallowed', async () => {
    const response = await request(baseUrl)
      .delete(relativeUrl)
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 405);
    assert.equal(response.body.code, 405);
  });
}

function patchCampaignCsvTestCases() {
  it('should return 405, PATCH is disallowed', async function() {
    const response = await request(baseUrl)
      .patch(relativeUrl)
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 405);
    assert.equal(response.body.code, 405);
  });
}

it('should campaigncsv service registration be ok', () => {
  const userService = app.service('campaigncsv');
  assert.ok(userService, 'Registered the service');
});

describe(`Test GET ${relativeUrl}`, getCampaignCsvTestCases);
describe(`Test POST ${relativeUrl}`, postCampaignCsvTestCases);
describe(`Test PUT ${relativeUrl}`, putCampaignCsvTestCases);
describe(`Test DELETE ${relativeUrl}`, deleteCampaignCsvTestCases);
describe(`Test PATCH ${relativeUrl}`, patchCampaignCsvTestCases);
