// Initializes the `conversations` service on path `/conversations`
const createService = require('feathers-mongoose');
const { createModel } = require('../../models/conversations.model');
const hooks = require('./conversations.hooks');
const { defaultFeatherMongooseOptions } = require('../serviceCommons');
const { generateSwaggerDocForCRUDService } = require('../../utils/swaggerUtils');

module.exports = function conversations() {
  const app = this;
  const Model = createModel(app);
  const paginate = app.get('paginate');

  const options = {
    name: 'conversations',
    Model,
    paginate,
    ...defaultFeatherMongooseOptions,
  };

  const service = createService(options);
  service.docs = generateSwaggerDocForCRUDService(service, ['remove', 'update', 'patch']);
  // Initialize our service with any options it requires
  app.use('/conversations', service);

  // Get our initialized service so that we can register hooks and filters
  app.service('conversations').hooks(hooks);
};
