const { expect, assert } = require('chai');
const config = require('config');

const {
  getTokenBySymbol,
  getValidSymbols,
  getWhiteListTokens,
  isSymbolInTokenWhitelist,
} = require('./tokenHelper');

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

function getValidSymbolsTestCases() {
  it('should return correct validSymbols tokens', () => {
    assert.sameDeepMembers(getValidSymbols(), [
      'ETH',
      'SAI',
      'DAI',
      'PAN',
      'WBTC',
      'BTC',
      'USDC',
      'ANT',
      'XDAI',
      'USD',
      'EUR',
      'CAD',
      'GBP',
      'AUD',
      'BRL',
      'CHF',
      'CZK',
      'MXN',
      'THB',
    ]);

    // expect().to.be.deep.equal();
  });
}

function isSymbolInTokenWhitelistTestCases() {
  it('should return true for DAI token', () => {
    assert.isTrue(isSymbolInTokenWhitelist('DAI'));
  });
  it('should return true for WBTC token', () => {
    assert.isTrue(isSymbolInTokenWhitelist('WBTC'));
  });
  it('should return true for PAN token', () => {
    assert.isTrue(isSymbolInTokenWhitelist('PAN'));
  });
  it('should return false for NODE token', () => {
    assert.isFalse(isSymbolInTokenWhitelist('NODE'));
  });
  it('should return true for EUR token', () => {
    assert.isTrue(isSymbolInTokenWhitelist('EUR'));
  });
  it('should return true for THB token', () => {
    assert.isTrue(isSymbolInTokenWhitelist('THB'));
  });
}

describe('test getTokenBySymbol() function', getTokenBySymbolTestCases);
describe('test getWhiteListTokens() function', getWhiteListTokensTestCases);
describe('test isSymbolInTokenWhitelist() function', isSymbolInTokenWhitelistTestCases);
describe('test getValidSymbols() function', getValidSymbolsTestCases);
