const config = require('config');

let tokensByAddress;

function getTokenByAddress(address) {
  const ANY_TOKEN = {
    name: 'ANY_TOKEN',
    address: '0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF',
    foreignAddress: '0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF',
    symbol: 'ANY_TOKEN',
    decimals: 18,
  };
  if (!tokensByAddress) {
    tokensByAddress = {};
    config.get('tokenWhitelist').forEach(token => {
      tokensByAddress[token.address] = token;
    });
  }
  tokensByAddress[ANY_TOKEN.address] = ANY_TOKEN;
  return tokensByAddress[address];
}

module.exports = {
  getTokenByAddress,
}
