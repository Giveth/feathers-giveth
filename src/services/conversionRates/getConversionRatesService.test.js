const { assert } = require('chai');
const { assertThrowsAsync } = require('../../../test/testUtility');
const {
  getHourlyCryptoConversion,
  getHourlyRateCryptocompare,
} = require('./getConversionRatesService');
const { getFeatherAppInstance } = require('../../app');

const app = getFeatherAppInstance();

function getHourlyCryptoConversionTestCases() {
  it('Stable coin to USD', async () => {
    const now = new Date();
    const result = await getHourlyCryptoConversion(app, now.getTime(), 'DAI', 'USD');
    assert.isOk(result);
    assert.equal(result.rate, 1, 'Stable coin rate should equal USD');
  });

  it('XDAI is not stableCoin but rateEqSymbol of XDAI is a stableCoin', async () => {
    const now = new Date();
    const result = await getHourlyCryptoConversion(app, now.getTime(), 'XDAI', 'USD');
    assert.isOk(result);
    assert.equal(result.rate, 1, 'XDAI coin rate should equal USD');
  });

  it('USD to Stable coin', async () => {
    const now = new Date();
    const result = await getHourlyCryptoConversion(app, now.getTime(), 'USD', 'DAI');
    assert.isOk(result);
    assert.equal(result.rate, 1, 'USD rate should equal Stable coin');
  });

  it('PAN to USD', async () => {
    const sampleDate = new Date('2020-12-14T01:12:28.606Z');
    const result = await getHourlyCryptoConversion(app, sampleDate.getTime(), 'PAN', 'USD');
    assert.isOk(result);
    assert.isBelow(result.rate, 0.066, 'PAN token price at the moment should be below 0.66');
    assert.isAbove(result.rate, 0.065, 'PAN token price at the moment should be above 0.65');
  });

  it('PAN to DAI', async () => {
    const sampleDate = new Date('2020-12-14T01:12:28.606Z');
    const result = await getHourlyCryptoConversion(app, sampleDate.getTime(), 'PAN', 'DAI');
    assert.isOk(result);
    assert.isBelow(result.rate, 0.066, 'PAN token price at the moment should be below 0.66');
    assert.isAbove(result.rate, 0.065, 'PAN token price at the moment should be above 0.65');
  });

  it('WBTC to PAN', async () => {
    const sampleDate = new Date('2020-12-14T01:12:28.606Z');
    const result = await getHourlyCryptoConversion(app, sampleDate.getTime(), 'WBTC', 'PAN');
    assert.isOk(result);
    assert.isBelow(result.rate, 295000, 'BTC price to PAN at the moment should be below 295000');
    assert.isAbove(result.rate, 287000, 'BTC price to PAN at the moment should be above 287000');
  });

  it('PAN to ANT', async () => {
    const sampleDate = new Date('2020-12-14T01:12:28.606Z');
    const result = await getHourlyCryptoConversion(app, sampleDate.getTime(), 'PAN', 'ANT');
    assert.isOk(result);
    assert.isBelow(result.rate, 0.023, 'PAN price to ANT at the moment should be below 0.023');
    assert.isAbove(result.rate, 0.021, 'PAN price to ANT at the moment should be above 0.021');
  });

  it('ETH to BTC', async () => {
    const sampleDate = new Date('2020-12-14T01:12:28.606Z');
    const result = await getHourlyCryptoConversion(app, sampleDate.getTime(), 'ETH', 'BTC');
    assert.isOk(result);
    assert.isBelow(result.rate, 0.032, 'ETH to BTC at the moment should be below 0.032');
    assert.isAbove(result.rate, 0.03, 'ETH to BTC at the moment should be above 0.030');
  });

  it('WBTC to ETH', async () => {
    const sampleDate = new Date('2020-12-14T01:12:28.606Z');
    const result = await getHourlyCryptoConversion(app, sampleDate.getTime(), 'WBTC', 'ETH');
    assert.isOk(result);
    assert.isBelow(result.rate, 33, 'WBTC to ETH at the moment should be below 33');
    assert.isAbove(result.rate, 32, 'WBTC to ETH at the moment should be above 32');
  });
}

function getHourlyRateCryptocompareTestCases() {
  it('should return correct values for DAI', async () => {
    const now = new Date();
    const result = await getHourlyRateCryptocompare(
      now.setUTCMinutes(0, 0, 0),
      {
        symbol: 'DAI',
      },
      {
        symbol: 'USD',
        decimals: 3,
      },
    );
    assert.isOk(result);
  });

  it('should return correct values with valid fromToken rateEqSymbol', async () => {
    const now = new Date();
    const result = await getHourlyRateCryptocompare(
      now.setUTCMinutes(0, 0, 0),
      {
        symbol: 'XDAI',
        rateEqSymbol: 'DAI',
      },
      {
        symbol: 'USD',
        decimals: 3,
      },
    );
    assert.isOk(result);
  });

  it('should return correct values with valid toToken rateEqSymbol', async () => {
    const now = new Date();
    const result = await getHourlyRateCryptocompare(
      now.setUTCMinutes(0, 0, 0),
      {
        symbol: 'USD',
      },
      {
        symbol: 'fakeDai',
        rateEqSymbol: 'DAI',
        decimals: 3,
      },
    );
    assert.isOk(result);
  });

  it('should throw exception for XDAI', async () => {
    const badFunc = async () => {
      await getHourlyRateCryptocompare(
        new Date().getTime(),
        {
          symbol: 'XDAI',
        },
        {
          symbol: 'USD',
          decimals: 3,
        },
      );
    };
    await assertThrowsAsync(badFunc);
  });
}

describe('getHourlyCryptoConversion() tests', getHourlyCryptoConversionTestCases);
describe('getHourlyRateCryptocompare() tests', getHourlyRateCryptocompareTestCases);
