const { getTokenBySymbol } = require('../utils/tokenHelper');

module.exports = () => async context => {
  const { query } = context.params;
  if (query && query.$select && Array.isArray(query.$select) && query.$select.includes('token')) {
    const index = query.$select.indexOf('token');
    query.$select[index] = 'tokenAddress';
  }
  if (query && query['token.symbol']) {
    const token = getTokenBySymbol(query['token.symbol']);
    if (token) {
      query.tokenAddress = token.address;
      delete query['token.symbol'];
    }
  }
  return context;
};
