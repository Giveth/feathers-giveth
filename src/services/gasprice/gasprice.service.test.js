const request = require('supertest');
const config = require('config');
const { assert } = require('chai');
const { getFeatherAppInstance } = require('../../app');

const app = getFeatherAppInstance();

const baseUrl = config.get('givethFathersBaseUrl');
const relativeUrl = '/gasprice';

function getGasPriceTestCases() {
  it('should return the value that is in the config', async function() {
    const response = await request(baseUrl).get(relativeUrl);
    assert.equal(response.statusCode, 200);
    assert.exists('average');
    assert.exists('avgWait');
    assert.exists('fastestWait');
    assert.exists('fastest');
    assert.exists('gasPriceRange');
  });
}

it('should events gasprice registration be ok', () => {
  const userService = app.service('gasprice');
  assert.ok(userService, 'Registered the service');
});

describe(`Test GET ${relativeUrl}`, getGasPriceTestCases);
