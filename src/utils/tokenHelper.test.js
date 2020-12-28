const { expect, assert } = require('chai');
const config = require('config');
const { getTokenBySymbol, getWhiteListTokens } = require('./tokenHelper');

const tokens = config.get('tokenWhitelist');

function getTokenBySymbolTestCases() {
  it('should return ETH token', () => {
    const ethToken = tokens.find(token => token.symbol === 'ETH');
    const token = getTokenBySymbol('ETH');
    expect(token).to.be.deep.equal(ethToken);
  });
  it('should return undefined for invalid token symbol', () => {
    const invalidSymbol = 'InvalidTokenSymbol';
    const token = getTokenBySymbol(invalidSymbol);
    assert.isOk(token);
    assert.equal(token.symbol, invalidSymbol);
  });
}

function getWhiteListTokensTestCases() {
  it('should return correct whiteList tokens', () => {
    expect(getWhiteListTokens()).to.be.deep.equal(tokens);
  });
}

describe('test getTokenBySymbol() function', getTokenBySymbolTestCases);
describe('test getWhiteListTokens() function', getWhiteListTokensTestCases);
