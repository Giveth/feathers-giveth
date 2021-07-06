const createService = require('feathers-mongoose');
const { createModel } = require('../../models/subscription.model');

const hooks = require('./subscription.hooks');
const { defaultFeatherMongooseOptions } = require('../serviceCommons');
const { updateSubscriptionProject } = require('../../repositories/subscriptionRepository');

module.exports = function subscribe() {
  const app = this;
  const Model = createModel(app);
  const paginate = app.get('paginate');

  const options = {
    name: 'subscriptions',
    Model,
    paginate,
    ...defaultFeatherMongooseOptions,
  };
  const subscribeService = createService(options);
  subscribeService.create = async (data, params) => {
    const { user } = params;
    const result = await updateSubscriptionProject(app, {
      userAddress: user.address,
      enabled: data.enabled,
      projectType: data.projectType,
      projectTypeId: data.projectTypeId,
    });
    return result;
  };

  subscribeService.docs = {
    securities: ['create'],
    operations: {
      update: false,
      patch: false,
      remove: false,
      find: {
        'parameters[0]': {
          name: 'userAddress',
          in: 'query',
        },
        'parameters[1]': {
          name: 'projectType',
          in: 'query',
        },
        'parameters[2]': {
          name: 'projectTypeId',
          in: 'query',
        },
        'parameters[3]': undefined,
      },
      create: {
        description: 'For subscribe and unsubscribe call this endpoint with enabled',
      },
    },
    definition: {
      type: 'object',
      properties: {
        projectType: {
          type: 'string',
        },
        projectTypeId: {
          type: 'string',
        },
        enabled: {
          type: 'boolean',
        },
      },
    },
  };
  app.use('/subscriptions', subscribeService);

  // Get our initialized service so that we can register hooks and filters
  const service = app.service('subscriptions');

  service.hooks(hooks);
};
