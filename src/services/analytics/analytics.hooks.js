const config = require('config');

const { rateLimit } = require('../../utils/rateLimit');

module.exports = {
  before: {
    create: [
      rateLimit({
        threshold: config.rateLimit.threshold,
        ttl: config.rateLimit.ttlSeconds,
      }),
    ],
  },
};
