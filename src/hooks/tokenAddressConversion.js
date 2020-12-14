const { getTokenBySymbol } = require('../utils/tokenHelper');

module.exports = () => async context => {
  if (
    context.params.query &&
    context.params.query.$select &&
    context.params.query.$select.includes('token')
  ) {
    const index = context.params.query.$select.indexOf('token');
    context.params.query.$select[index] = 'tokenAddress';
  }
  if (context.params.query && context.params.query['token.symbol']) {
    const token = getTokenBySymbol(context.params.query['token.symbol']);
    if (token) {
      context.params.query.tokenAddress = token.address;
      delete context.params.query['token.symbol'];
    }
  }
  return context;
};
