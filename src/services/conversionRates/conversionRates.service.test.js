const request = require('supertest');
const config = require('config');
const { assert } = require('chai');

const baseUrl = config.get('givethFathersBaseUrl');
const relativeUrl = '/conversionRates';

function getConversionRatesTestCases() {
  const btcSymbol = 'BTC';

  it('should get successful result', async function() {
    const response = await request(baseUrl)
      .get(relativeUrl)
      .query({ symbol: btcSymbol });
    assert.equal(response.statusCode, 200);
    assert.exists(response.body.rates);
  });

  it('should get equal values for BTC and WBTC', async function() {
    const wbtcSumbol = 'WBTC';
    const response = await request(baseUrl)
      .get(relativeUrl)
      .query({ symbol: wbtcSumbol });
    console.log("response.body", response.body);
    assert.equal(response.statusCode, 200);
    assert.exists(response.body.rates);
    assert.equal(response.body.rates[btcSymbol], 1);
  });
}

describe('test get /conversationsRates', getConversionRatesTestCases);
