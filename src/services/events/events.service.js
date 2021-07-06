// Initializes the `events` service on path `/events`
const createService = require('feathers-mongoose');
const { generateSwaggerDocForCRUDService } = require('../../utils/swaggerUtils');

const { createModel } = require('../../models/events.model');
const hooks = require('./events.hooks');
const { defaultFeatherMongooseOptions } = require('../serviceCommons');

module.exports = function events() {
  const app = this;
  const Model = createModel(app);
  const paginate = app.get('paginate');

  const options = {
    name: 'events',
    Model,
    paginate,
    ...defaultFeatherMongooseOptions,
  };

  const service = createService(options);
  service.docs = generateSwaggerDocForCRUDService(service, ['remove', 'update', 'patch', 'create']);
  // Initialize our service with any options it requires
  app.use('/events', service);

  // Get our initialized service so that we can register hooks and filters
  app.service('events').hooks(hooks);
};
