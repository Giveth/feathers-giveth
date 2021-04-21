const request = require('supertest');
const config = require('config');
const { assert } = require('chai');
const { getJwt } = require('../../../test/testUtility');
const { getFeatherAppInstance } = require('../../app');

let app;
const baseUrl = config.get('givethFathersBaseUrl');
const relativeUrl = '/homePaymentsTransactions';

function getHomePaymentsTransactionsTestCases() {
  it('should return successful result', async () => {
    const response = await request(baseUrl).get(relativeUrl);
    assert.equal(response.statusCode, 200);
    assert.isArray(response.body.data);
  });
}

function postHomePaymentsTransactionsTestCases() {
  it('should return 405, POST is disallowed', async function() {
    const response = await request(baseUrl)
      .post(relativeUrl)
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 405);
    assert.equal(response.body.code, 405);
  });
}

function putHomePaymentsTransactionsTestCases() {
  it('should return 405, PUT is disallowed', async function() {
    const response = await request(baseUrl)
      .put(relativeUrl)
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 405);
    assert.equal(response.body.code, 405);
  });
}

function deleteHomePaymentsTransactionsTestCases() {
  it('should return 405, DELETE is disallowed', async function() {
    const response = await request(baseUrl)
      .delete(relativeUrl)
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 405);
    assert.equal(response.body.code, 405);
  });
}

function patchHomePaymentsTransactionsTestCases() {
  it('should return 405, PATCH is disallowed', async function() {
    const response = await request(baseUrl)
      .patch(relativeUrl)
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 405);
    assert.equal(response.body.code, 405);
  });
}

it('should homePaymentsTransactions service registration be ok', () => {
  const service = app.service('homePaymentsTransactions');
  assert.ok(service, 'Registered the service');
});

describe(`Test GET ${relativeUrl}`, getHomePaymentsTransactionsTestCases);
describe(`Test POST ${relativeUrl}`, postHomePaymentsTransactionsTestCases);
describe(`Test PUT ${relativeUrl}`, putHomePaymentsTransactionsTestCases);
describe(`Test DELETE ${relativeUrl}`, deleteHomePaymentsTransactionsTestCases);
describe(`Test PATCH ${relativeUrl}`, patchHomePaymentsTransactionsTestCases);

before(() => {
  app = getFeatherAppInstance();
});
