const request = require('supertest');
const config = require('config');
const { assert } = require('chai');
const { getJwt } = require('../../../test/testUtility');
const { getFeatherAppInstance } = require('../../app');

const app = getFeatherAppInstance();
const baseUrl = config.get('givethFathersBaseUrl');
const relativeUrl = '/analytics';
const pageType = 'page';
const trackingType = 'track';
function postAnalyticsTestCases() {
  it('should return successful when sending page', async () => {
    const response = await request(baseUrl)
      .post(relativeUrl)
      .send({
        reportType: pageType,
      })
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 201);
  });

  it('should return successful when sending tracking', async () => {
    const response = await request(baseUrl)
      .post(relativeUrl)
      .send({
        reportType: trackingType,
      })
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 201);
  });

  it('should get 400, invalid reportType', async () => {
    const reportType = 'invalidReportType';
    const response = await request(baseUrl)
      .post(relativeUrl)
      .send({
        reportType,
      })
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 400);
  });
}

it('should analytics service registration be ok', () => {
  const service = app.service('analytics');
  assert.ok(service, 'Registered the service');
});

describe(`Test POST ${relativeUrl}`, postAnalyticsTestCases);
