const { disallow } = require('feathers-hooks-common');
const errors = require('@feathersjs/errors');

const onlyInternal = require('../../hooks/onlyInternal');
const {
  getConversionRates,
  getHourlyCryptoConversion,
  getHourlyMultipleCryptoConversion,
} = require('./getConversionRatesService');
const { getTransaction } = require('../../blockchain/lib/web3Helpers');

const findConversionRates = () => async context => {
  const { app, params } = context;

  // return context to avoid recursion
  // getConversionRates also calls this hook
  if (params.internal) return context;
  const {
    date: queryDate,
    to,
    symbol,
    from,
    interval: queryInterval,
    txHash,
    isHome,
  } = params.query;

  let date = Number(queryDate);
  let interval = queryInterval;

  if (txHash) {
    let error;
    try {
      const tx = await getTransaction(app, txHash, isHome === 'true');
      if (tx) {
        date = tx.timestamp;
        interval = 'hourly';
      }
    } catch (e) {
      error = e;
    }
    if (error) throw new errors.BadRequest(`Invalid tx ${error}`);
  }

  if (interval === 'hourly') {
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

module.exports = {
  before: {
    all: [],
    find: [],
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
