// Initializes the `events` service on path `/events`
const createService = require('feathers-mongoose');
const { generateSwaggerDocForCRUDService } = require('../../utils/swaggerUtils');

const { createModel } = require('../../models/homePaymentsTransactions.model');
const hooks = require('./homePaymentsTransactions.hooks');
const { defaultFeatherMongooseOptions } = require('../serviceCommons');

module.exports = function homePaymentsTransactions() {
  const app = this;
  const Model = createModel(app);
  const paginate = app.get('paginate');

  const options = {
    name: 'homePaymentsTransactions',
    Model,
    paginate,
    ...defaultFeatherMongooseOptions,
  };

  const service = createService(options);
  service.docs = generateSwaggerDocForCRUDService(service, ['remove', 'update', 'patch', 'create']);
  // Initialize our service with any options it requires
  app.use('/homePaymentsTransactions', service);

  // Get our initialized service so that we can register hooks and filters
  app.service('homePaymentsTransactions').hooks(hooks);
};
