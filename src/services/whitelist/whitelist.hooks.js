const logger = require('winston');
const config = require('config');

const { getTokenBySymbol } = require('../../utils/tokenHelper');

const minimumPayoutUsdValue = config.get('minimumPayoutUsdValue');
let cachedMinimumPayoutValue;

async function fillPayoutValue(app, nativeCurrencyWhitelist) {
  const minimumPayoutValue = {
    USD: minimumPayoutUsdValue,
  };
  try {
    const lastHour = new Date();
    const lastHourUTC = lastHour.setUTCMinutes(0, 0, 0);
    if (
      cachedMinimumPayoutValue &&
      // we update minimumPayoutValue every hour
      cachedMinimumPayoutValue.time === lastHourUTC &&
      // if fetching coin values from cryptocompare fails, then minimumPayoutValue should have just
      // USD so next time we should try getting coin values
      Object.keys(cachedMinimumPayoutValue.minimumPayoutValue).length ===
        nativeCurrencyWhitelist.length
    ) {
      // if we dont cache minimumPayoutValue the response time will increase from 60 ms to 1300ms
      return cachedMinimumPayoutValue.minimumPayoutValue;
    }
    const currenciesRateValues = await app.service('conversionRates').find({
      query: {
        from: 'USD',
        to: nativeCurrencyWhitelist.map(c => c.symbol),
        interval: 'hourly',
      },
    });
    Object.keys(currenciesRateValues.rates).forEach(symbol => {
      minimumPayoutValue[symbol] = currenciesRateValues.rates[symbol] * minimumPayoutUsdValue;
    });
    cachedMinimumPayoutValue = {
      time: lastHourUTC,
      minimumPayoutValue,
    };
  } catch (e) {
    logger.error('fillPayoutValue error', e);
  }
  return minimumPayoutValue;
}

const getWhitelist = () => async context => {
  const { app } = context;

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
  let minimumPayoutValue;
  if (minimumPayoutUsdValue) {
    minimumPayoutValue = await fillPayoutValue(app, nativeCurrencyWhitelist, minimumPayoutUsdValue);
  }
  context.result = {
    reviewerWhitelistEnabled,
    delegateWhitelistEnabled,
    projectOwnersWhitelistEnabled,
    tokenWhitelist,
    activeTokenWhitelist,
    fiatWhitelist,
    nativeCurrencyWhitelist,
    minimumPayoutValue,
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
