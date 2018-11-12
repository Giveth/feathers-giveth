const commons = require('feathers-hooks-common');
const errors = require('@feathersjs/errors');

const checkToken = context => {
  const tokenWhitelist = context.app.get('tokenWhitelist');

  const items = commons.getItems(context);

  const inWhitelist = project => {
    if (tokenWhitelist.find(t => t.address === project.token.address)) return;

    throw new errors.BadRequest(
      `token ${project.token.symbol} is not in the whitelist`,
    );
  };

  if (Array.isArray(items)) {
    items.forEach(inWhitelist);
  } else {
    inWhitelist(items);
  }
  return context;
};

module.exports = {
  isTokenAllowed: () => context => checkToken(context),
}