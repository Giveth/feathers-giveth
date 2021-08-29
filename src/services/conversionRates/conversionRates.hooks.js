const { disallow } = require('feathers-hooks-common');
const config = require('config');
const errors = require('@feathersjs/errors');

const { rateLimit } = require('../../utils/rateLimit');
const onlyInternal = require('../../hooks/onlyInternal');
const { errorMessages } = require('../../utils/errorMessages');
const { isSymbolInTokenWhitelist } = require('../../utils/tokenHelper');
const {
  getConversionRates,
  getHourlyCryptoConversion,
  getHourlyMultipleCryptoConversion,
} = require('./getConversionRatesService');

const findConversionRates = () => async context => {
  const { app, params } = context;

  // return context to avoid recursion
  // getConversionRates also calls this hook
  if (params.internal) return context;
  const { date: queryDate, to, symbol, from, interval: queryInterval } = params.query;

  const date = Number(queryDate);
  if (queryInterval === 'hourly') {
    if (Array.isArray(to)) {
      return getHourlyMultipleCryptoConversion(app, date, from, to).then(res => {
        context.result = res;
        return context;
      });
    }

    return getHourlyCryptoConversion(app, date, from, to).then(res => {
      context.result = res;
      return context;
    });
  }
  // daily
  return getConversionRates(app, date, symbol, to).then(res => {
    context.result = res;
    return context;
  });
};
const validateSymbols = () => async context => {
  const { params } = context;
  const { to, symbol } = params.query;
  if (symbol && !isSymbolInTokenWhitelist(symbol)) {
    throw new errors.BadRequest(errorMessages.SENT_SYMBOL_IS_NOT_IN_TOKEN_WITHE_LIST);
  }
  if (to && !Array.isArray(to) && !isSymbolInTokenWhitelist(to)) {
    throw new errors.BadRequest(errorMessages.SENT_TO_IS_NOT_IN_TOKEN_WITHE_LIST);
  }
  if (to && Array.isArray(to)) {
    // to can be string or array of strings
    to.forEach(toSymbol => {
      if (!isSymbolInTokenWhitelist(toSymbol)) {
        throw new errors.BadRequest(errorMessages.SENT_TO_IS_NOT_IN_TOKEN_WITHE_LIST);
      }
    });
  }
  return context;
};

module.exports = {
  before: {
    all: [],
    find: [
      validateSymbols(),
      rateLimit({
        threshold: config.rateLimit.threshold,
        ttl: config.rateLimit.ttlSeconds,
      }),
    ],
    get: [disallow()],
    create: [onlyInternal()],
    update: [disallow()],
    patch: [onlyInternal()], // New currencies can be added, but disallow update
    remove: [disallow()],
  },

  after: {
    all: [],
    find: [findConversionRates()],
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
