const { assert } = require('chai');
const { assertThrowsAsync } = require('../../../test/testUtility');
const { getHourlyRateCryptocompare, findNewestData } = require('./getConversionRatesService');

function getHourlyRateCryptocompareTestCases() {
  it('should return correct values for DAI', async () => {
    const result = await getHourlyRateCryptocompare(
      new Date().getTime(),
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
    const result = await getHourlyRateCryptocompare(
      new Date().getTime(),
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
    const result = await getHourlyRateCryptocompare(
      new Date().getTime(),
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

function findNewestDataTestCases() {
  it('should return the object with biggest time value', function() {
    const data = {
      Data: [
        {
          time: 1607742000,
        },
        {
          time: 1607742001,
        },
        {
          time: 1607742005,
        },
        {
          time: 1607742004,
        },
        {
          time: 1607742002,
        },
      ],
    };
    const result = findNewestData(data);
    assert.equal(result.time, 1607742005);
  });
  it('should return falsy value', function() {
    const data = {
      Data: {},
    };
    const result = findNewestData(data);
    assert.isNotOk(result);
  });
}

describe('getHourlyRateCryptocompare() tests', getHourlyRateCryptocompareTestCases);
describe('findNewestData() tests', findNewestDataTestCases);
