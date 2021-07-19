// Initializes the `pledgeAdmins` service on path `/pledgeAdmins`
const createService = require('feathers-mongoose');
const { generateSwaggerDocForCRUDService } = require('../../utils/swaggerUtils');

const { createModel } = require('../../models/pledgeAdmins.model');
const hooks = require('./pledgeAdmins.hooks');
const { defaultFeatherMongooseOptions } = require('../serviceCommons');

module.exports = function pledgeAdmins() {
  const app = this;
  const Model = createModel(app);
  const paginate = app.get('paginate');

  const options = {
    name: 'pledgeAdmins',
    id: 'id',
    Model,
    paginate,
    ...defaultFeatherMongooseOptions,
  };

  const service = createService(options);
  service.docs = generateSwaggerDocForCRUDService(service, ['remove', 'create', 'patch', 'update']);

  // Initialize our service with any options it requires
  app.use('/pledgeAdmins', service);

  // Get our initialized service so that we can register hooks and filters
  app.service('pledgeAdmins').hooks(hooks);
};
