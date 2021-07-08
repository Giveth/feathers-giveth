const { sendAnalytics } = require('../../utils/analyticsUtils');

module.exports = function analytics() {
  const app = this;
  const analyticsService = {
    async create(data, params) {
      const result = sendAnalytics({ data, params });
      return result;
    },
  };
  app.use('/analytics', analyticsService);
};
