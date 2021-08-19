const config = require('config');
const { RateLimiterRedis } = require('rate-limiter-flexible');
const Redis = require('ioredis');
const Sentry = require('@sentry/node');

const redisClient = new Redis({ ...config.redis, enableOfflineQueue: false });
const errors = require('@feathersjs/errors');
const { isRequestInternal } = require('./feathersUtils');

/**
 *
 * @param options {ttl: number(seconds), threshold:number, errorMessage:string}
 * @returns {function(*): *}
 */
const rateLimit = (options = {}) => {
  const { threshold, ttl, errorMessage } = options;
  /**
   * @see {@link https://github.com/animir/node-rate-limiter-flexible/wiki/Overall-example#create-rate-limiter-and-consume-points-on-every-request}
   */
  const opts = {
    storeClient: redisClient,
    points: threshold,
    duration: ttl, // Per second
  };
  const rateLimiter = new RateLimiterRedis(opts);

  return async context => {
    if (
      isRequestInternal(context) ||
      // internal calls that use the external context doesnt have headers
      !context.params.headers ||
      // for requests that use _populate it will fill after first call
      context.params._populate ||
      config.rateLimit.disable
    ) {
      // Should not count internal requests
      return context;
    }
    const ip = context.params.headers['x-real-ip'] || context.params.headers.cookie;
    // if we just use ip as key, can not use separate rate limit for separate web services
    const key = `${context.path}-${context.method}-${ip}`;
    try {
      // await messageLimiter.consume(ip);
      await rateLimiter.consume(key);
    } catch (e) {
      // It's for knowing how much user got rate limit, maybe should change the threshold configs
      Sentry.captureException(new Error(`Someone got rate limit error ${key}`), {
        user: context.params.user,
        ip,
        path: context.path,
        method: context.method,
      });
      throw new errors.TooManyRequests(errorMessage || 'Too many requests');
    }

    return context;
  };
};
module.exports = { rateLimit };
