const request = require('supertest');
const config = require('config');
const { assert } = require('chai');
const { getJwt, SAMPLE_DATA } = require('../../../test/testUtility');
const { getFeatherAppInstance } = require('../../app');

const app = getFeatherAppInstance();
const baseUrl = config.get('givethFathersBaseUrl');
const relativeUrl = '/users';

function getUserTestCases() {
  it('should get successful result', async function() {
    const response = await request(baseUrl).get(relativeUrl);
    assert.equal(response.statusCode, 200);
    assert.exists(response.body.data);
    assert.notEqual(response.body.data.length, 0);
  });
  it('getUserDetail', async function() {
    const response = await request(baseUrl).get(`${relativeUrl}/${SAMPLE_DATA.USER_ADDRESS}`);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.address, SAMPLE_DATA.USER_ADDRESS);
  });
}

function postUserTestCases() {
  // cant test create use successfully because create user need token and for verifying token
  // you need to have user is like egg and hen

  it('should get unAuthorized error', async function() {
    const response = await request(baseUrl)
      .post(relativeUrl)
      .send(SAMPLE_DATA.CREATE_MILESTONE_DATA);
    assert.equal(response.statusCode, 401);
    assert.equal(response.body.code, 401);
  });
}

function patchUserTestCases() {
  it('should update name of user successfully', async function() {
    const testName = `testName ${new Date()}`;
    const response = await request(baseUrl)
      .patch(`${relativeUrl}/${SAMPLE_DATA.USER_ADDRESS}`)
      .send({ name: testName })
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.name, testName);
  });

  it('should get unAuthorized error', async function() {
    const response = await request(baseUrl).patch(`${relativeUrl}/${SAMPLE_DATA.USER_ADDRESS}`);
    assert.equal(response.statusCode, 401);
    assert.equal(response.body.code, 401);
  });
}

function deleteUserTestCases() {
  it('should get 405, method is no allowed ', async function() {
    const response = await request(baseUrl)
      .delete(`${relativeUrl}/${SAMPLE_DATA.USER_ADDRESS}`)
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 405);
    assert.equal(response.body.code, 405);
  });
}

it('should users service registration be ok', () => {
  const service = app.service('users');
  assert.ok(service, 'Registered the service');
});

describe(`Test GET  ${relativeUrl}`, getUserTestCases);
describe(`Test POST  ${relativeUrl}`, postUserTestCases);
describe(`Test PATCH  ${relativeUrl}`, patchUserTestCases);
describe(`Test DELETE  ${relativeUrl}`, deleteUserTestCases);
