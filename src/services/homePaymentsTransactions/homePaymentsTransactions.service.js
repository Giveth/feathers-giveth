// Initializes the `events` service on path `/events`
const createService = require('feathers-mongoose');
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

  // Initialize our service with any options it requires
  app.use('/homePaymentsTransactions', createService(options));

  // Get our initialized service so that we can register hooks and filters
  const service = app.service('homePaymentsTransactions');

  service.hooks(hooks);
};
