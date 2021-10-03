const config = require('config');
const { ANY_TOKEN } = require('../blockchain/lib/web3Helpers');

const tokensBySymbols = {};
const tokensByAddress = {};
const tokensByForeignAddress = {};
const validSymbols = [];

const getWhiteListTokens = () => {
  return config.get('tokenWhitelist');
};

function getTokenByAddress(address) {
  return tokensByAddress[address];
}

function getTokenByForeignAddress(foreignAddress) {
  return tokensByForeignAddress[foreignAddress];
}

function getTokenBySymbol(symbol) {
  return tokensBySymbols[symbol] || { symbol };
}

const initialize = () => {
  const _tokenSymbolSet = new Set();

  getWhiteListTokens().forEach(token => {
    tokensByForeignAddress[token.foreignAddress] = token;
    tokensByAddress[token.address] = token;
    tokensBySymbols[token.symbol] = token;

    _tokenSymbolSet.add(token.symbol);
    if (token.rateEqSymbol) {
      _tokenSymbolSet.add(token.rateEqSymbol);
    }
  });
  config.nativeCurrencyWhitelist.forEach(currency => {
    _tokenSymbolSet.add(currency.symbol);
  });
  tokensByForeignAddress[ANY_TOKEN.foreignAddress] = ANY_TOKEN;
  tokensByAddress[ANY_TOKEN.address] = ANY_TOKEN;
  tokensBySymbols[ANY_TOKEN.symbol] = ANY_TOKEN;

  validSymbols.push(...Array.from(_tokenSymbolSet));
};

initialize();

const getValidSymbols = () => {
  return validSymbols;
};

const isSymbolInTokenWhitelist = symbol => {
  return validSymbols.includes(symbol);
};

module.exports = {
  getTokenBySymbol,
  getWhiteListTokens,
  getTokenByAddress,
  getTokenByForeignAddress,
  isSymbolInTokenWhitelist,
  getValidSymbols,
};
