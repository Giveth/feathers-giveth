const request = require('supertest');
const config = require('config');
const { assert } = require('chai');
const { getJwt, SAMPLE_DATA, generateRandomMongoId } = require('../../../test/testUtility');
const { getFeatherAppInstance } = require('../../app');
const { ProjectTypes } = require('../../models/subscription.model');

const app = getFeatherAppInstance();
const baseUrl = config.get('givethFathersBaseUrl');
const relativeUrl = '/subscriptions';

function getSubscriptionsTestCases() {
  it('should return successful result', async () => {
    const response = await request(baseUrl).get(relativeUrl);
    assert.equal(response.statusCode, 200);
    assert.isArray(response.body.data);
  });
}

function postSubscriptionsTestCases() {
  it('should get unAuthorized error', async () => {
    const response = await request(baseUrl).post(relativeUrl);
    assert.equal(response.statusCode, 401);
    assert.equal(response.body.code, 401);
  });

  it('should return successful when subscribing milestone', async () => {
    const projectObjectId = SAMPLE_DATA.MILESTONE_ID;
    const projectType = ProjectTypes.MILESTONE;
    const response = await request(baseUrl)
      .post(relativeUrl)
      .send({
        projectTypeId: projectObjectId,
        projectType,
        enabled: true,
      })
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 201);
    assert.equal(response.body.projectType, projectType);
    assert.equal(response.body.projectTypeId, projectObjectId);
    assert.equal(response.body.enabled, true);
  });

  it('should return successful when unSubscribing milestone', async () => {
    const projectObjectId = SAMPLE_DATA.MILESTONE_ID;
    const projectType = ProjectTypes.MILESTONE;
    const response = await request(baseUrl)
      .post(relativeUrl)
      .send({
        projectTypeId: projectObjectId,
        projectType,
        enabled: false,
      })
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 201);
    assert.equal(response.body.projectType, projectType);
    assert.equal(response.body.projectTypeId, projectObjectId);
    assert.equal(response.body.enabled, false);
  });

  it('should return successful when subscribing campaign', async () => {
    const projectObjectId = SAMPLE_DATA.CAMPAIGN_ID;
    const projectType = ProjectTypes.CAMPAIGN;
    const response = await request(baseUrl)
      .post(relativeUrl)
      .send({
        projectTypeId: projectObjectId,
        projectType,
        enabled: true,
      })
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 201);
    assert.equal(response.body.projectType, projectType);
    assert.equal(response.body.projectTypeId, projectObjectId);
    assert.equal(response.body.enabled, true);
  });
  it('should return successful when unSubscribing campaign', async () => {
    const projectObjectId = SAMPLE_DATA.CAMPAIGN_ID;
    const projectType = ProjectTypes.CAMPAIGN;
    const response = await request(baseUrl)
      .post(relativeUrl)
      .send({
        projectTypeId: projectObjectId,
        projectType,
        enabled: false,
      })
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 201);
    assert.equal(response.body.projectType, projectType);
    assert.equal(response.body.projectTypeId, projectObjectId);
    assert.equal(response.body.enabled, false);
  });

  it('should return successful when subscribing dac', async () => {
    const projectObjectId = SAMPLE_DATA.DAC_ID;
    const projectType = ProjectTypes.DAC;
    const response = await request(baseUrl)
      .post(relativeUrl)
      .send({
        projectTypeId: projectObjectId,
        projectType,
        enabled: true,
      })
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 201);
    assert.equal(response.body.projectType, projectType);
    assert.equal(response.body.projectTypeId, projectObjectId);
    assert.equal(response.body.enabled, true);
  });
  it('should return successful when unSubscribing dac', async () => {
    const projectObjectId = SAMPLE_DATA.DAC_ID;
    const projectType = ProjectTypes.DAC;
    const response = await request(baseUrl)
      .post(relativeUrl)
      .send({
        projectTypeId: projectObjectId,
        projectType,
        enabled: false,
      })
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 201);
    assert.equal(response.body.projectType, projectType);
    assert.equal(response.body.projectTypeId, projectObjectId);
    assert.equal(response.body.enabled, false);
  });

  it('should get 400, Invalid projectType', async () => {
    const projectObjectId = SAMPLE_DATA.DAC_ID;
    const response = await request(baseUrl)
      .post(relativeUrl)
      .send({
        projectTypeId: projectObjectId,
        projectType: 'invalid projectType',
        enabled: true,
      })
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 400);
  });

  it('should get 400, projectTypeId is required', async () => {
    const projectType = ProjectTypes.DAC;
    const response = await request(baseUrl)
      .post(relativeUrl)
      .send({
        projectType,
        enabled: false,
      })
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 400);
  });
  it('should get 400, projectTypeId is required', async () => {
    const projectType = ProjectTypes.DAC;
    const projectObjectId = SAMPLE_DATA.DAC_ID;

    const response = await request(baseUrl)
      .post(relativeUrl)
      .send({
        projectType,
        projectTypeId: projectObjectId,
      })
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 400);
  });

  it('should get 400, projectTypeId is required', async () => {
    const projectObjectId = SAMPLE_DATA.DAC_ID;
    const response = await request(baseUrl)
      .post(relativeUrl)
      .send({
        projectTypeId: projectObjectId,
      })
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 400);
  });

  it('should get 400, invalid projectTypeId', async () => {
    const projectType = ProjectTypes.DAC;
    const response = await request(baseUrl)
      .post(relativeUrl)
      .send({
        projectType,
        enabled: true,
        projectTypeId: generateRandomMongoId(),
      })
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 404);
  });
}

function putSubscriptionsTestCases() {
  it('should return 405, PUT is disallowed', async () => {
    const response = await request(baseUrl)
      .put(relativeUrl)
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 405);
    assert.equal(response.body.code, 405);
  });
}

function deleteSubscriptionsTestCases() {
  it('should return 405, DELETE is disallowed', async () => {
    const response = await request(baseUrl)
      .delete(relativeUrl)
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 405);
    assert.equal(response.body.code, 405);
  });
}

function patchSubscriptionsTestCases() {
  it('should return 405, PATCH is disallowed', async () => {
    const response = await request(baseUrl)
      .patch(relativeUrl)
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 405);
    assert.equal(response.body.code, 405);
  });
}

it('should subscriptions service registration be ok', () => {
  const service = app.service('subscriptions');
  assert.ok(service, 'Registered the service');
});

describe(`Test GET ${relativeUrl}`, getSubscriptionsTestCases);
describe(`Test POST ${relativeUrl}`, postSubscriptionsTestCases);
describe(`Test PUT ${relativeUrl}`, putSubscriptionsTestCases);
describe(`Test DELETE ${relativeUrl}`, deleteSubscriptionsTestCases);
describe(`Test PATCH ${relativeUrl}`, patchSubscriptionsTestCases);
