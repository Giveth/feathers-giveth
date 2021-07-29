const request = require('supertest');
const config = require('config');
const { assert } = require('chai');

const baseUrl = config.get('givethFathersBaseUrl');
const relativeUrl = '/createCampaignForGivethioProjects';

function getGasPriceTestCases() {
  it('get error if fromDate didnt send', async () => {
    const response = await request(baseUrl).get(`${relativeUrl}?projectIds=1,2,3,4,5,22`);
    assert.equal(response.statusCode, 400);
    assert.equal(
      response.body.message,
      'fromDate is required with this format: YYYY/MM/DD-hh:mm:ss',
    );
  });
  it('get error if toDate didnt send', async () => {
    const response = await request(baseUrl).get(
      `${relativeUrl}?projectIds=1,2,3,4,5,22&fromDate=2018/01/01-00:00:00`,
    );
    assert.equal(response.statusCode, 400);
    assert.equal(response.body.message, 'toDate is required with this format: YYYY/MM/DD-hh:mm:ss');
  });
  it('get success response', async () => {
    const response = await request(baseUrl).get(
      `${relativeUrl}?projectIds=1,2,3,4,5,22&fromDate=2020/01/01-00:00:00&toDate=2020/01/01-00:00:00`,
    );
    assert.equal(response.statusCode, 200);
    assert.exists(response.body.total);
    assert.exists(response.body.data);
    assert.isArray(response.body.data);
  });
}

describe(`Test GET ${relativeUrl}`, getGasPriceTestCases);
