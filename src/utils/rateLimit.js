// it's written based on https://github.com/AZaviruha/feathers-hooks-ratelimit
const config = require('config');
const { FastRateLimit } = require('fast-ratelimit');
const errors = require('@feathersjs/errors');
const { isRequestInternal } = require('./feathersUtils');

/**
 *
 * @param options {ttl: number(seconds), threshold:number, errorMessage:string}
 * @returns {function(*): *}
 */
const rateLimit = (options = {}) => {
  const { threshold, ttl, errorMessage } = options;
  const messageLimiter = new FastRateLimit({ threshold, ttl });

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

    console.log("ratelimiter : ", {params: context.params, disableRateLimit:config.disableRateLimit})

    try {
      await messageLimiter.consume(ip);
    } catch (e) {
      throw new errors.TooManyRequests(errorMessage || 'Too many requests');
    }

    return context;
  };
};
module.exports = { rateLimit };
