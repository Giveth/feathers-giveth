const createService = require('feathers-mongoose');
const { generateSwaggerDocForCRUDService } = require('../../utils/swaggerUtils');

const { createModel } = require('../../models/emails.model');
const hooks = require('./emails.hooks');
const { defaultFeatherMongooseOptions } = require('../serviceCommons');

module.exports = function emails() {
  const app = this;
  const Model = createModel(app);
  const paginate = app.get('paginate');

  const options = {
    name: 'emails',
    Model,
    paginate,
    ...defaultFeatherMongooseOptions,
  };

  const service = createService(options);
  service.docs = generateSwaggerDocForCRUDService(service, ['remove', 'create', 'update', 'patch']);
  // Initialize our service with any options it requires
  app.use('/emails', service);

  // Get our initialized service so that we can register hooks and filters
  app.service('emails').hooks(hooks);
};
