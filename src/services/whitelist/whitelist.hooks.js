const { getTokenBySymbol } = require('../../utils/tokenHelper');

const getWhitelist = () => context => {
  const { app } = context;

  // fetch whitelisted addresses from default.json
  // const reviewers = app.get('useReviewerWhitelist') ? app.get('reviewerWhitelist') : [];
  // const delegates = app.get('useDelegateWhitelist') ? app.get('delegateWhitelist') : [];
  // const projectOwners = app.get('useProjectOwnerWhitelist') ? app.get('projectOwnerWhitelist') : [];
  const tokenWhitelist = app.get('tokenWhitelist');
  let activeTokenWhitelist =
    app.get('activeTokenWhitelist') &&
    app.get('activeTokenWhitelist').map(symbol => {
      return getTokenBySymbol(symbol);
    });
  if (!activeTokenWhitelist) {
    activeTokenWhitelist = app.get('tokenWhitelist');
  }
  const fiatWhitelist = app.get('fiatWhitelist');
  const nativeCurrencyWhitelist = app.get('nativeCurrencyWhitelist');
  context.result = {
    tokenWhitelist,
    activeTokenWhitelist,
    fiatWhitelist,
    nativeCurrencyWhitelist,
  };
  return context;
};

module.exports = {
  // TODO I think all method should be disallowed o not-implemented except GET
  before: {
    all: [],
    find: [],
    get: [],
    create: [],
    update: [],
    patch: [],
    remove: [],
  },

  after: {
    all: [],
    find: [getWhitelist()],
    get: [],
    create: [],
    update: [],
    patch: [],
    remove: [],
  },

  error: {
    all: [],
    find: [],
    get: [],
    create: [],
    update: [],
    patch: [],
    remove: [],
  },
};
