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

  analyticsService.docs = {
    operations: {
      update: false,
      patch: false,
      remove: false,
      find: false,
      create: {
        description:
          'This is for sending analytics event, Brave block analytics, so the gievth-dapp send analytic event by feathers-giveth in this case',
      },
    },
    definition: {
      type: 'object',
      properties: {
        properties: {
          type: 'object',
        },
        userId: {
          type: 'string',
        },
        event: {
          type: 'string',
        },
        anonymousId: {
          type: 'string',
        },
        reportType: {
          type: 'string',
          enum: ['track', 'page'],
        },
      },
    },
  };
  app.use('/analytics', analyticsService);
  app.service('analytics').hooks(hooks);
};
