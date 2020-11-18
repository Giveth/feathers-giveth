const request = require('supertest');
const config = require('config');
const { assert, expect } = require('chai');

const baseUrl = config.get('givethFathersBaseUrl');
const relativeUrl = '/gasprice';

function getGasPriceTestCases(){
  it('should return the value that is in the config', async function() {
    const response = await request(baseUrl)
      .get(relativeUrl);

    assert.equal(response.statusCode, 200);
    assert.exists('average');
    assert.exists('avgWait');
    assert.exists('fastestWait');
    assert.exists('fastest');
    assert.exists('gasPriceRange');
  });
}



describe(`Test GET ${relativeUrl}`, getGasPriceTestCases);
