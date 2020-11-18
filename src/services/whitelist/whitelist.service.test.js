const request = require('supertest');
const config = require('config');
const { assert, expect } = require('chai');

const baseUrl = config.get('givethFathersBaseUrl');
const relativeUrl = '/whitelist';

function getGasPriceTestCases() {
  it('should return the value that some of them are in the config', async function() {
    const response = await request(baseUrl).get(relativeUrl);

    assert.equal(response.statusCode, 200);
    assert.isArray(response.body.reviewerWhitelist);
    assert.isArray(response.body.delegateWhitelist);
    assert.isArray(response.body.projectOwnerWhitelist);
    expect(response.body.fiatWhitelist).to.deep.equal(config.get('fiatWhitelist'));
    expect(response.body.tokenWhitelist).to.deep.equal(config.get('tokenWhitelist'));
  });
}

describe(`Test GET ${relativeUrl}`, getGasPriceTestCases);
