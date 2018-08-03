// Initializes the `gasprice` service on path `/gasprice`
const createService = require('feathers-memory');
const hooks = require('./gasprice.hooks');

module.exports = function gasPrice() {
  const app = this;
  const paginate = app.get('paginate');

  const options = {
    name: 'gasprice',
    paginate,
  };

  // Initialize our service with any options it requires
  app.use('/gasprice', createService(options));

  // Get our initialized service so that we can register hooks and filters
  const service = app.service('gasprice');

  service.hooks(hooks);
};
