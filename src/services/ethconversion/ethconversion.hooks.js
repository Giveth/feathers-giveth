const { disallow } = require('feathers-hooks-common');

const onlyInternal = require('../../hooks/onlyInternal');
const { getEthConversion } = require('./getEthConversionService');

const getConversionRates = () => context => {
  const { app, params } = context;

  // return context to avoid recursion
  // getEthConversion also calls this hook
  if (params.internal) return context;

  return getEthConversion(app, params.query.date, params.query.symbol).then(res => {
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
    find: [getConversionRates()],
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
