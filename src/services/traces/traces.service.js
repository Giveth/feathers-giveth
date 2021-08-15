// Initializes the `traces` service on path `/traces`
const createService = require('feathers-mongoose');
const { generateSwaggerDocForCRUDService } = require('../../utils/swaggerUtils');
const { createModel } = require('../../models/traces.model');
const hooks = require('./traces.hooks');
const { defaultFeatherMongooseOptions } = require('../serviceCommons');

module.exports = function traces() {
  const app = this;
  const Model = createModel(app);
  const paginate = app.get('paginate');

  const options = {
    name: 'traces',
    Model,
    paginate,
    ...defaultFeatherMongooseOptions,
  };

  const service = createService(options);
  service.docs = generateSwaggerDocForCRUDService(service);

  app.use('/traces', service);

  app.service('traces').hooks(hooks);
};
