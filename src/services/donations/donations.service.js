// Initializes the `donations` service on path `/donations`
const createService = require('feathers-mongoose');
const { generateSwaggerDocForCRUDService } = require('../../utils/swaggerUtils');

const { createModel } = require('../../models/donations.model');
const hooks = require('./donations.hooks');
const { defaultFeatherMongooseOptions } = require('../serviceCommons');

module.exports = function serviceFactory() {
  const app = this;
  const Model = createModel(app);
  const paginate = app.get('paginate');

  const options = {
    name: 'donations',
    Model,
    paginate,
    ...defaultFeatherMongooseOptions,
  };

  const service = createService(options);
  service.docs = generateSwaggerDocForCRUDService(service);
  service.docs.operations.create = {
    description:
      'This method has authentication for REST requests but in websocket request not needed accessToken',
  };
  // Initialize our service with any options it requires
  app.use('/donations', service);

  // Get our initialized service so that we can register hooks and filters
  app.service('donations').hooks(hooks);
};
