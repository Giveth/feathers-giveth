import onlyInternal from '../../hooks/onlyInternal';
import { getEthConversion } from './getEthConversionService';
import { disallow } from 'feathers-hooks-common';

const getConversionRates = () => context => {
  const { app, params } = context;

  // return context to avoid recursion
  // getEthConversion also calls this hook
  if (params.internal) return context;

  return getEthConversion(app, params.query.date).then(res => {
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
    patch: [disallow()],
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
