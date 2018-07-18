// Initializes the `transactions` service on path `/transactions`
const createService = require('feathers-mongoose');
const createModel = require('../../models/transactions.model');
const hooks = require('./transactions.hooks');

module.exports = function() {
  const app = this;
  const Model = createModel(app);
  const paginate = app.get('paginate');

  const options = {
    name: 'transactions',
    Model,
    paginate,
  };

  // Initialize our service with any options it requires
  app.use('/transactions', createService(options));

  // Get our initialized service so that we can register hooks and filters
  const service = app.service('transactions');

  service.hooks(hooks);
};
