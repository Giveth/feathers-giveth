// Initializes the `communities` service on path `/communities`
const createService = require('feathers-mongoose');
const { generateSwaggerDocForCRUDService } = require('../../utils/swaggerUtils');
const { createModel } = require('../../models/communities.model');
const hooks = require('./communities.hooks');
const { defaultFeatherMongooseOptions } = require('../serviceCommons');

module.exports = function communities() {
  const app = this;
  const Model = createModel(app);
  const paginate = app.get('paginate');

  const options = {
    name: 'communities',
    Model,
    paginate,
    ...defaultFeatherMongooseOptions,
  };

  const service = createService(options);
  service.docs = generateSwaggerDocForCRUDService(service);
  // Initialize our service with any options it requires
  app.use('/communities', service);

  // Get our initialized service so that we can register hooks and filters
  app.service('communities').hooks(hooks);
};
