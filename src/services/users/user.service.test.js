const request = require('supertest');
const config = require('config');
const { assert } = require('chai');
const { getJwt, SAMPLE_DATA} = require('../../../test/testUtility');
const { getFeatherAppInstance } = require('../../app');

const app = getFeatherAppInstance();
const baseUrl = config.get('givethFathersBaseUrl');
const relativeUrl = '/users';

function getUserTestCases() {
  it('should get successful result', async () => {
    const response = await request(baseUrl).get(relativeUrl);
    assert.equal(response.statusCode, 200);
    assert.exists(response.body.data);
    assert.notEqual(response.body.data.length, 0);
  });
  it('getUserDetail', async () => {
    const response = await request(baseUrl).get(`${relativeUrl}/${SAMPLE_DATA.USER_ADDRESS}`);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.address, SAMPLE_DATA.USER_ADDRESS);
  });
}

function postUserTestCases() {
  // cant test create use successfully because create user need token and for verifying token
  // you need to have user is like egg and hen

  it('should get unAuthorized error', async () => {
    const response = await request(baseUrl)
      .post(relativeUrl)
      .send(SAMPLE_DATA.CREATE_MILESTONE_DATA);
    assert.equal(response.statusCode, 401);
    assert.equal(response.body.code, 401);
  });
}

function patchUserTestCases() {
  it('should update name of user successfully', async () => {
    const testName = `testName ${new Date()}`;
    const response = await request(baseUrl)
      .patch(`${relativeUrl}/${SAMPLE_DATA.USER_ADDRESS}`)
      .send({ name: testName })
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.name, testName);
  });

  it('should get unAuthorized error', async () => {
    const response = await request(baseUrl).patch(`${relativeUrl}/${SAMPLE_DATA.USER_ADDRESS}`);
    assert.equal(response.statusCode, 401);
    assert.equal(response.body.code, 401);
  });

  it('should update users access by admin', async () => {
    const response = await request(baseUrl)
      .patch(`${relativeUrl}/${SAMPLE_DATA.SECOND_USER_ADDRESS}`)
      .send({
        isReviewer: true,
        isInProjectOwner: true,
        isDelegator: true,
      })
      .set({ Authorization: getJwt(SAMPLE_DATA.ADMIN_USER_ADDRESS) });
    assert.equal(response.statusCode, 200);
    assert.isTrue(response.body.isReviewer);
    assert.isTrue(response.body.isInProjectOwner);
    assert.isTrue(response.body.isDelegator);

    console.log('change back secondUsers permissions');
    await request(baseUrl)
      .patch(`${relativeUrl}/${SAMPLE_DATA.SECOND_USER_ADDRESS}`)
      .send({
        isReviewer: false,
        isInProjectOwner: false,
        isDelegator: false,
      })
      .set({ Authorization: getJwt(SAMPLE_DATA.ADMIN_USER_ADDRESS) });
  });

  it('non-admin user cant update his/her accesses', async () => {
    const response = await request(baseUrl)
      .patch(`${relativeUrl}/${SAMPLE_DATA.SECOND_USER_ADDRESS}`)
      .send({
        isReviewer: true,
        isInProjectOwner: true,
        isDelegator: true,
      })
      .set({ Authorization: getJwt(SAMPLE_DATA.SECOND_USER_ADDRESS) });
    assert.equal(response.statusCode, 403);
  });

  it('admin user can update his/her accesses', async () => {
    const response = await request(baseUrl)
      .patch(`${relativeUrl}/${SAMPLE_DATA.ADMIN_USER_ADDRESS}`)
      .send({
        isReviewer: true,
        isInProjectOwner: true,
        isDelegator: true,
      })
      .set({ Authorization: getJwt(SAMPLE_DATA.ADMIN_USER_ADDRESS) });
    assert.equal(response.statusCode, 200);
    assert.isTrue(response.body.isReviewer);
    assert.isTrue(response.body.isInProjectOwner);
    assert.isTrue(response.body.isDelegator);
  });
}

function deleteUserTestCases() {
  it('should get 405, method is no allowed ', async () => {
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
