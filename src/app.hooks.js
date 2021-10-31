// Application hooks that run for every service
const auth = require('@feathersjs/authentication');
const errors = require('@feathersjs/errors');
const config = require('config');
const logger = require('winston');
const { discard } = require('feathers-hooks-common');
const { NotAuthenticated } = require('@feathersjs/errors');
const { errorMessages } = require('./utils/errorMessages');
const { DonationStatus } = require('./models/donations.model');
const { isRequestInternal } = require('./utils/feathersUtils');
const { responseLoggerHook, startMonitoring } = require('./hooks/logger');
const { rateLimit } = require('./utils/rateLimit');

const {
  getTtlSeconds,
  getThreshold,
  threshold: rateLimitThreshold,
  ttlSeconds: rateLimitTtlSeconds,
} = config.rateLimit;
const authenticate = () => context => {
  // No need to authenticate internal calls
  if (isRequestInternal(context)) return context;
  if (context.path === 'analytics') {
    return context;
  }
  if (context.path === 'verifiedCampaigns' && context.method === 'update') {
    // we check this route with basic authentication
    return context;
  }
  // socket connection is already authenticated, we just check if user has been set on context.params
  if (context.params.provider === 'socketio' && context.params.user) {
    return context;
  }
  // if the path is authentication that means user wants to login and get accessToken
  if (context.params.provider === 'socketio' && context.path === 'authentication') {
    return context;
  }
  if (
    context.params.provider === 'socketio' &&
    context.path === 'donations' &&
    context.method === 'create' &&
    context.data.status === DonationStatus.PENDING
  ) {
    // for creating donations it's not needed to be authenticated, anonymous users can donate
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

const parseErrors = () => context => {
  // verified field is boolean in Trace, Campaign and Community so for getting this filter
  // in query string we should cast it to boolean here
  if (context.error.message.includes('Invalid query parameter')) {
    logger.info('Mongo error in feathers call', context.error);
    throw new errors.BadRequest(errorMessages.INVALID_INPUT_DATA);
  }
  if (context.error.stack && context.error.stack.includes('MongoError')) {
    logger.info('Mongo error in feathers call', context.error);
    throw new errors.BadRequest(errorMessages.INVALID_INPUT_DATA);
  }
  if (context.error.stack && context.error.type !== 'FeathersError') {
    // Should not return stack error to client when error is not instance of Feathers error
    logger.info('Error with stack', context.error);
    throw new errors.GeneralError();
  }
  return context;
};

module.exports = {
  before: {
    all: [startMonitoring()],
    find: [
      convertVerifiedToBoolean(),
      rateLimit({
        threshold: getThreshold,
        ttl: getTtlSeconds,
      }),
    ],
    get: [
      rateLimit({
        threshold: getThreshold,
        ttl: getTtlSeconds,
      }),
    ],
    create: [authenticate()],
    update: [
      authenticate(),
      rateLimit({
        threshold: rateLimitThreshold,
        ttl: rateLimitTtlSeconds,
      }),
    ],
    patch: [
      authenticate(),
      rateLimit({
        threshold: rateLimitThreshold,
        ttl: rateLimitTtlSeconds,
      }),
    ],
    remove: [
      authenticate(),
      rateLimit({
        threshold: rateLimitThreshold,
        ttl: rateLimitTtlSeconds,
      }),
    ],
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
    all: [responseLoggerHook(), parseErrors()],
    find: [],
    get: [],
    create: [],
    update: [],
    patch: [],
    remove: [],
  },
};
