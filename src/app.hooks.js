// Application hooks that run for every service
const auth = require('@feathersjs/authentication');
const { discard } = require('feathers-hooks-common');
const { responseLoggerHook, startMonitoring } = require('./hooks/logger');

const authenticate = () => context => {
  // socket connection is already authenticated
  if (context.params.provider !== 'rest') return context;
  return auth.hooks.authenticate('jwt')(context);
};

const convertVerfiedToBoolean = () => context => {
  // verified field is boolean in Trace, Campaign and Community so for getting this filter
  // in query string we should cast it to boolean here
  if (context.params.query && context.params.query.verified === 'true') {
    context.params.query.verified = true;
  } else if (context.params.query && context.params.query.verified === 'false') {
    context.params.query.verified = false;
  }
  return context;
};

module.exports = {
  before: {
    all: [startMonitoring()],
    find: [convertVerfiedToBoolean()],
    get: [],
    create: [authenticate()],
    update: [authenticate()],
    patch: [authenticate()],
    remove: [authenticate()],
  },

  after: {
    all: [responseLoggerHook(), discard('__v')],
    find: [],
    get: [],
    create: [],
    update: [],
    patch: [],
    remove: [],
  },

  error: {
    all: [responseLoggerHook()],
    find: [],
    get: [],
    create: [],
    update: [],
    patch: [],
    remove: [],
  },
};
