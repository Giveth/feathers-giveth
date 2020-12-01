const config = require('config');

let tokensBySymbols;
let tokensByAddress;
const getWhiteListTokens = () => {
  return config.get('tokenWhitelist');
};

function getTokenByAddress(address) {
  if (!tokensByAddress) {
    tokensByAddress = {};
    getWhiteListTokens().forEach(token => {
      tokensByAddress[token.address] = token;
    });
  }
  return tokensByAddress[address];
}
function getTokenBySymbol(symbol) {
  if (!tokensBySymbols) {
    tokensBySymbols = {};
    getWhiteListTokens().forEach(token => {
      tokensBySymbols[token.symbol] = token;
    });
  }
  return tokensBySymbols[symbol];
}

module.exports = {
  getTokenBySymbol,
  getWhiteListTokens,
  getTokenByAddress,
};
