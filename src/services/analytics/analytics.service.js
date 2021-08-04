const { sendAnalytics } = require('../../utils/analyticsUtils');
const hooks = require('./analytics.hooks');

module.exports = function analytics() {
  const app = this;
  const analyticsService = {
    async create(data, params) {
      const result = sendAnalytics({ data, params });
      return result;
    },
  };
  // TODO write swagger
  app.use('/analytics', analyticsService);
  app.service('analytics').hooks(hooks);
};
