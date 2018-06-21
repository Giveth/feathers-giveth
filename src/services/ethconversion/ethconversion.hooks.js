import { disallow } from 'feathers-hooks-common';

import onlyInternal from '../../hooks/onlyInternal';
import { getEthConversion } from './getEthConversionService';

const getConversionRates = () => context => {
  const { app, params } = context;

  // return context to avoid recursion
  // getEthConversion also calls this hook
  if (params.internal) return context;

  return getEthConversion(app, params.query.date).then(res => {
    const context2 = Object.assign({}, context);
    const res2 = Object.assign({}, res);
    res2.rates.ETH = 1;
    context2.result = res2;
    return context2;
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
