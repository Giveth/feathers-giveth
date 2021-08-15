// Initializes the `campaigns` service on path `/campaigns`
const createService = require('feathers-mongoose');
const { createModel } = require('../../models/campaigns.model');
const { generateSwaggerDocForCRUDService } = require('../../utils/swaggerUtils');
const hooks = require('./campaigns.hooks');
const { defaultFeatherMongooseOptions } = require('../serviceCommons');

module.exports = function registerService() {
  const app = this;
  const Model = createModel(app);
  const paginate = app.get('paginate');

  const options = {
    name: 'campaigns',
    Model,
    paginate,
    ...defaultFeatherMongooseOptions,
  };

  const service = createService(options);
  service.docs = generateSwaggerDocForCRUDService(service);
  // Initialize our service with any options it requires
  app.use('/campaigns', service);

  // Get our initialized service so that we can register hooks and filters
  app.service('campaigns').hooks(hooks);
};
