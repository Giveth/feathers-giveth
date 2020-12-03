const { disallow } = require('feathers-hooks-common');

const onlyInternal = require('../../hooks/onlyInternal');
const { getConversionRates, getHourlyCryptoConversion, getHourlyMultipleCryptoConversion } = require('./getConversionRatesService');

const findConversionRates = () => context => {
  const { app, params } = context;

  // return context to avoid recursion
  // getConversionRates also calls this hook
  if (params.internal) return context;

  if (params.query.interval === 'hourly') {
    if (Array.isArray(params.query.to)) {
      return getHourlyMultipleCryptoConversion(app, params.query.date, params.query.from, params.query.to).then(res => {
        context.result = res;
        return context;
      });
    }
    else {
      return getHourlyCryptoConversion(app, params.query.date, params.query.from, params.query.to).then(res => {
        context.result = res;
        return context;
      });
    }
  }
  else { //daily
      return getConversionRates(app, params.query.date, params.query.symbol).then(res => {
        context.result = res;
        return context;
      });
  }

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
