// Application hooks that run for every service
const auth = require('@feathersjs/authentication');
const { discard } = require('feathers-hooks-common');
const { NotAuthenticated } = require('@feathersjs/errors');
const logger = require('./hooks/logger');
const { isRequestInternal } = require('./utils/feathersUtils');

const authenticate = () => context => {
  // No need to authenticate internal calls
  if (isRequestInternal(context)) return context;

  // socket connection is already authenticated, we just check if user has been set on context.params
  if (context.params.provider === 'socketio' && context.params.user) {
    return context;
  }
  // if the path is authentication that means user wants to login and get accessToken
  if (context.params.provider === 'socketio' && context.path === 'authentication') {
    return context;
  }
  if (context.params.provider === 'rest') {
    return auth.hooks.authenticate('jwt')(context);
  }
  throw new NotAuthenticated();
};

const convertVerifiedToBoolean = () => context => {
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
    all: [],
    find: [convertVerifiedToBoolean()],
    get: [],
    create: [authenticate()],
    update: [authenticate()],
    patch: [authenticate()],
    remove: [authenticate()],
  },

  after: {
    all: [logger(), discard('__v')],
    find: [],
    get: [],
    create: [],
    update: [],
    patch: [],
    remove: [],
  },

  error: {
    all: [logger()],
    find: [],
    get: [],
    create: [],
    update: [],
    patch: [],
    remove: [],
  },
};
