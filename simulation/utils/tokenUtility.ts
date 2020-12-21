const config = require('config');

const ANY_TOKEN = {
  name: 'ANY_TOKEN',
  address: '0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF',
  foreignAddress: '0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF',
  symbol: 'ANY_TOKEN',
  decimals: 18,
};
let tokensByAddress;

export function getTokenByAddress(address:string) {

  if (!tokensByAddress) {
    tokensByAddress = {};
    config.get('tokenWhitelist').forEach(token => {
      tokensByAddress[token.address] = token;
    });
  }
  tokensByAddress[ANY_TOKEN.address] = ANY_TOKEN;
  return tokensByAddress[address];
}


let tokensByForeignAddress;
export function getTokenByForeignAddress(foreignAddress:string) {
  if (!tokensByForeignAddress) {
    tokensByForeignAddress = {};
    config.get('tokenWhitelist').forEach(token => {
      tokensByForeignAddress[token.foreignAddress] = token;
    });
    tokensByForeignAddress[ANY_TOKEN.foreignAddress] = ANY_TOKEN;
  }
  return tokensByForeignAddress[foreignAddress];
}
