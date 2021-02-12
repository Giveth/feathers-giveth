const request = require('supertest');
const config = require('config');
const { assert } = require('chai');
const { getJwt } = require('../../../test/testUtility');
const { getFeatherAppInstance } = require('../../app');

const app = getFeatherAppInstance();
const baseUrl = config.get('givethFathersBaseUrl');
const relativeUrl = '/emails';

function getEmailsTestCases() {
  it('should return successful result', async () => {
    const response = await request(baseUrl).get(relativeUrl);
    assert.equal(response.statusCode, 200);
    assert.isArray(response.body.data);
  });
}

function postEmailsTestCases() {
  it('should return 405, POST is disallowed', async () => {
    const response = await request(baseUrl)
      .post(relativeUrl)
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 405);
    assert.equal(response.body.code, 405);
  });
}

function putEmailsTestCases() {
  it('should return 405, PUT is disallowed', async function() {
    const response = await request(baseUrl)
      .put(relativeUrl)
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 405);
    assert.equal(response.body.code, 405);
  });
}

function deleteEmailsTestCases() {
  it('should return 405, DELETE is disallowed', async function() {
    const response = await request(baseUrl)
      .delete(relativeUrl)
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 405);
    assert.equal(response.body.code, 405);
  });
}

function patchEmailsTestCases() {
  it('should return 405, PATCH is disallowed', async function() {
    const response = await request(baseUrl)
      .patch(relativeUrl)
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 405);
    assert.equal(response.body.code, 405);
  });
}

it('should emails service registration be ok', () => {
  const service = app.service('emails');
  assert.ok(service, 'Registered the service');
});

describe(`Test GET ${relativeUrl}`, getEmailsTestCases);
describe(`Test POST ${relativeUrl}`, postEmailsTestCases);
describe(`Test PUT ${relativeUrl}`, putEmailsTestCases);
describe(`Test DELETE ${relativeUrl}`, deleteEmailsTestCases);
describe(`Test PATCH ${relativeUrl}`, patchEmailsTestCases);
