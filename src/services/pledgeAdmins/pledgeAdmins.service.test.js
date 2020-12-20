const request = require('supertest');
const config = require('config');
const { assert } = require('chai');
const { getJwt } = require('../../../test/testUtility');
const { getFeatherAppInstance } = require('../../app');

const app = getFeatherAppInstance();
const baseUrl = config.get('givethFathersBaseUrl');
const relativeUrl = '/pledgeAdmins';

function getPledgeAdminsTestCases() {
  it('should return successful result', async function() {
    const response = await request(baseUrl).get(relativeUrl);
    assert.equal(response.statusCode, 200);
    assert.isArray(response.body.data);
  });
}

function postPledgeAdminsTestCases() {
  it('should return 403, POST is disallowed', async function() {
    const response = await request(baseUrl)
      .post(relativeUrl)
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 403);
    assert.equal(response.body.code, 403);
  });
}

function putPledgeAdminsTestCases() {
  it('should return 403, PUT is disallowed', async function() {
    const response = await request(baseUrl)
      .put(relativeUrl)
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 403);
    assert.equal(response.body.code, 403);
  });
}

function deletePledgeAdminsTestCases() {
  it('should return 405, DELETE is disallowed', async function() {
    const response = await request(baseUrl)
      .delete(relativeUrl)
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 405);
    assert.equal(response.body.code, 405);
  });
}

function patchPledgeAdminsTestCases() {
  it('should return 403, PATCH is disallowed', async function() {
    const response = await request(baseUrl)
      .patch(relativeUrl)
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 403);
    assert.equal(response.body.code, 403);
  });
}

it('should pledgeAdmins service registration be ok', () => {
  const service = app.service('pledgeAdmins');
  assert.ok(service, 'Registered the service');
});

describe(`Test GET ${relativeUrl}`, getPledgeAdminsTestCases);
describe(`Test POST ${relativeUrl}`, postPledgeAdminsTestCases);
describe(`Test PUT ${relativeUrl}`, putPledgeAdminsTestCases);
describe(`Test DELETE ${relativeUrl}`, deletePledgeAdminsTestCases);
describe(`Test PATCH ${relativeUrl}`, patchPledgeAdminsTestCases);
