// Application hooks that run for every service
const auth = require('@feathersjs/authentication');
const { discard } = require('feathers-hooks-common');
const Sentry = require('@sentry/node');
const logger = require('winston');
const loggerHook = require('./hooks/logger');

const errorHandlerHook = () => context => {
  const e = context.error;
  Sentry.captureException(e);
  delete e.context;

  if (context.path === 'authentication') {
    logger.debug(e);
  } else if (context.error.name === 'NotFound') {
    logger.info(`${context.path} - ${context.error.message}`);
  } else {
    logger.error('Hook error:', e);
  }
};

const authenticate = () => context => {
  // socket connection is already authenticated
  if (context.params.provider !== 'rest') return context;

  return auth.hooks.authenticate('jwt')(context);
};

module.exports = {
  before: {
    all: [],
    find: [],
    get: [],
    create: [authenticate()],
    update: [authenticate()],
    patch: [authenticate()],
    remove: [authenticate()],
  },

  after: {
    all: [loggerHook(), discard('__v')],
    find: [],
    get: [],
    create: [],
    update: [],
    patch: [],
    remove: [],
  },

  error: {
    all: [errorHandlerHook()],
    find: [],
    get: [],
    create: [],
    update: [],
    patch: [],
    remove: [],
  },
};
