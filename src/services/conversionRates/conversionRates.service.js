// Initializes the `conversionRates` service on path `/conversionRates`
const createService = require('feathers-mongoose');
const createModel = require('../../models/conversionRates.model');
const hooks = require('./conversionRates.hooks');
const { defaultFeatherMongooseOptions } = require('../serviceCommons');

module.exports = function conversionRates() {
  const app = this;
  const Model = createModel(app);
  const paginate = app.get('paginate');

  const options = {
    name: 'conversionRates',
    Model,
    paginate,
    ...defaultFeatherMongooseOptions,
  };
  const service = createService(options);
  service.docs = {
    operations: {
      find: {
        'parameters[0]': {
          name: 'date',
          in: 'query',
          description: 'timestamp for instance: 1624951936000',
        },
        'parameters[1]': {
          name: 'symbol',
          in: 'query',

          default: 'ETH',
        },
        'parameters[2]': {
          name: 'to',
          in: 'query',

          default: 'USD',
        },
        'parameters[3]': {
          name: 'interval',
          in: 'query',

          description: 'could be hourly',
        },
      },
      update: false,
      patch: false,
      remove: false,
      get: false,
      create: false,
    },
    definition: {},
  };
  // Initialize our service with any options it requires
  app.use('/conversionRates', service);

  // Get our initialized service so that we can register hooks and filters
  app.service('conversionRates').hooks(hooks);
};
