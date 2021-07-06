// Initializes the `whitelist` service on path `/whitelist`
const { getTokenBySymbol } = require('../../utils/tokenHelper');

module.exports = function whitelist() {
  const app = this;

  const whitelistService = {
    async find() {
      // fetch whitelisted addresses from default.json
      const reviewerWhitelistEnabled = !!app.get('useReviewerWhitelist');
      const delegateWhitelistEnabled = !!app.get('useDelegateWhitelist');
      const projectOwnersWhitelistEnabled = !!app.get('useProjectOwnerWhitelist');
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
      const minimumPayoutUsdValue = app.get('minimumPayoutUsdValue');

      return {
        reviewerWhitelistEnabled,
        delegateWhitelistEnabled,
        projectOwnersWhitelistEnabled,
        tokenWhitelist,
        activeTokenWhitelist,
        fiatWhitelist,
        nativeCurrencyWhitelist,
        minimumPayoutUsdValue,
      };
    },
  };

  whitelistService.docs = {
    operations: {
      find: {
        'parameters[0]': undefined,
        'parameters[1]': undefined,
        'parameters[2]': undefined,
        'parameters[3]': undefined,
      },
      update: false,
      patch: false,
      remove: false,
      get: false,
      create: false,
    },
    definition: {},
  };
  // Initialize our service with any options it requires
  app.use('/whitelist', whitelistService);
};
