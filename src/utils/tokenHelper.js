const config = require('config');
const { ANY_TOKEN } = require('../blockchain/lib/web3Helpers');

let tokensBySymbols;
let tokensByAddress;
let tokensByForeignAddress;
const getWhiteListTokens = () => {
  return config.get('tokenWhitelist');
};

function getTokenByAddress(address) {
  if (!tokensByAddress) {
    tokensByAddress = {};
    getWhiteListTokens().forEach(token => {
      tokensByAddress[token.address] = token;
    });
    tokensByAddress[ANY_TOKEN.address] = ANY_TOKEN;
  }
  return tokensByAddress[address];
}

function getTokenByForeignAddress(foreignAddress) {
  if (!tokensByForeignAddress) {
    tokensByForeignAddress = {};
    getWhiteListTokens().forEach(token => {
      tokensByForeignAddress[token.foreignAddress] = token;
    });
    tokensByForeignAddress[ANY_TOKEN.foreignAddress] = ANY_TOKEN;
  }
  return tokensByForeignAddress[foreignAddress];
}

function getTokenBySymbol(symbol) {
  if (!tokensBySymbols) {
    tokensBySymbols = {};
    getWhiteListTokens().forEach(token => {
      tokensBySymbols[token.symbol] = token;
    });
    tokensBySymbols[ANY_TOKEN.symbol] = ANY_TOKEN;
  }
  return tokensBySymbols[symbol] || { symbol };
}

const isSymbolInTokenWhitelist = symbol => {
  return Boolean(
    getWhiteListTokens().find(token => token.symbol === symbol) ||
      // for example we dont have BTC as symbol but it is rateEqSymbol for the WBTC token in our config
      getWhiteListTokens().find(token => token.rateEqSymbol === symbol),
  );
};

const getValidSymbols = () => {
  const symbols = [];
  getWhiteListTokens().forEach(token => {
    if (!symbols.includes(token.symbol)) {
      symbols.push(token.symbol);
    }
    if (token.rateEqSymbol && !symbols.includes(token.rateEqSymbol)) {
      symbols.push(token.rateEqSymbol);
    }
  });
  return symbols;
};

module.exports = {
  getTokenBySymbol,
  getWhiteListTokens,
  getTokenByAddress,
  getTokenByForeignAddress,
  isSymbolInTokenWhitelist,
  getValidSymbols,
};
