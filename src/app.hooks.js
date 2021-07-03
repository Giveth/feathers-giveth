// Application hooks that run for every service
const auth = require('@feathersjs/authentication');
const { discard } = require('feathers-hooks-common');
const responseLoggerHook = require('./hooks/logger');

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
