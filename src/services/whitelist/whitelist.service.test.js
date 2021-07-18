const request = require('supertest');
const config = require('config');
const { assert, expect } = require('chai');

const baseUrl = config.get('givethFathersBaseUrl');
const relativeUrl = '/whitelist';

function getWhiteListTestCases() {
  it('should return the value that some of them are in the config', async () => {
    const response = await request(baseUrl).get(relativeUrl);

    assert.equal(response.statusCode, 200);
    expect(response.body.fiatWhitelist).to.deep.equal(config.get('fiatWhitelist'));
    expect(response.body.tokenWhitelist).to.deep.equal(config.get('tokenWhitelist'));
  });

  it('should fill activeTokenWhitelist with tokenInfo ', async () => {
    const response = await request(baseUrl).get(relativeUrl);
    assert.equal(response.statusCode, 200);
    const { activeTokenWhitelist } = response.body;
    assert.isArray(activeTokenWhitelist);
    const activeTokenWhitelistSymbols = config.get('activeTokenWhitelist');
    assert.equal(activeTokenWhitelist.length, activeTokenWhitelistSymbols.length);
    activeTokenWhitelistSymbols.forEach(symbol => {
      const token = activeTokenWhitelist.find(item => item.symbol === symbol);
      assert.isOk(token);
      assert.isOk(token.symbol);
      assert.isOk(token.address);
      assert.isOk(token.name);
    });
  });
  it('should fill minimumPayoutUsdValue ', async () => {
    const minimumPayoutUsdValue = config.get('minimumPayoutUsdValue');
    const response = await request(baseUrl).get(relativeUrl);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.minimumPayoutUsdValue, minimumPayoutUsdValue);
  });
}

describe(`Test GET ${relativeUrl}`, getWhiteListTestCases);
