// Initializes the `users` service on path `/users`
const createService = require('feathers-mongoose');
const createModel = require('../../models/users.model');
const { generateSwaggerDocForCRUDService } = require('../../utils/swaggerUtils');

const hooks = require('./users.hooks');
const { defaultFeatherMongooseOptions } = require('../serviceCommons');

module.exports = function users() {
  const app = this;
  const Model = createModel(app);
  const paginate = app.get('paginate');

  const options = {
    name: 'users',
    id: 'address',
    Model,
    paginate,
    ...defaultFeatherMongooseOptions,
  };

  const service = createService(options);
  service.docs = generateSwaggerDocForCRUDService(service);
  // Initialize our service with any options it requires
  app.use('/users', service);

  // Get our initialized service so that we can register hooks and filters

  app.service('users').hooks(hooks);
};
