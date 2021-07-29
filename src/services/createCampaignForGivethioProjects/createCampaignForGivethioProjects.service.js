// const errors = require('@feathersjs/errors');
const { getProjectInfoBySLug } = require('../../utils/givethIoUtils');

module.exports = function aggregateDonations() {
  const app = this;

  const service = {
    async create(data, params) {
      console.log('context', { data, params });
      const projectInfo = await getProjectInfoBySLug(data.slug);
      return { projectInfo, params };
    },
  };
  service.docs = {
    // securities: ['create'],
    operations: {
      update: false,
      patch: false,
      remove: false,
      find: false,
      create: {
        description: 'For subscribe and unsubscribe call this endpoint with enabled',
      },
    },
    definition: {
      type: 'object',
      properties: {
        slug: {
          type: 'string',
        },
      },
    },
  };
  app.use('/createCampaignForGivethioProjects', service);
};
