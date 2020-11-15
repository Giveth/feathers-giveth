const request = require('supertest');
const config = require('config');
const { assert } = require('chai');

const baseUrl = config.get('givethFathersBaseUrl');

function getConversionRatesTestCases() {
  const btcSymbol = 'BTC';

  it('should get successful result', async function() {
    const response = await request(baseUrl)
      .get('/conversionRates')
      .query({ symbol: btcSymbol });
    assert.equal(response.statusCode, 200);
    assert.exists(response.body.rates);
  });

  it('should get equal values for BTC and WBTC', async function() {
    const wbtcSumbol = 'WBTC';
    const response = await request(baseUrl)
      .get('/conversionRates?symbol=BTC')
      .query({ symbol: wbtcSumbol });
    assert.equal(response.statusCode, 200);
    assert.exists(response.body.rates);
    assert.equal(response.body.rates[btcSymbol], 1);
  });
}

describe('test get /conversationsRates', getConversionRatesTestCases);
