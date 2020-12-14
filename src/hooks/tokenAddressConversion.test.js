const { assert } = require('chai');
const tokenAddressConversion = require('./tokenAddressConversion');
const { getTokenBySymbol } = require('../utils/tokenHelper');

function tokenAddressConversionTestCases() {
  it('should change token to tokenAddress in $select', async () => {
    const hook = tokenAddressConversion();
    const context = {
      params: {
        query: {
          $select: ['token', 'somethingElse'],
        },
      },
    };
    const newContext = await hook(context);
    assert.isTrue(newContext.params.query.$select.includes('tokenAddress'));
    assert.isFalse(newContext.params.query.$select.includes('token'));
  });

  it('should change token.symbol to tokenAddress in query', async () => {
    const hook = tokenAddressConversion();
    const tokenSymbol = 'ETH';
    const context = {
      params: {
        query: {
          'token.symbol': tokenSymbol,
        },
      },
    };
    const token = getTokenBySymbol(tokenSymbol);
    const newContext = await hook(context);
    assert.equal(newContext.params.query.tokenAddress, token.address);
    assert.notExists(newContext.params.query['token.symbol']);
  });
}

describe('test tokenAddressConversion conversion', tokenAddressConversionTestCases);
