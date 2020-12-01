const config = require('config');

let tokensBySymbols;
const getWhiteListTokens = () => {
  return config.get('tokenWhitelist');
};

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
};
