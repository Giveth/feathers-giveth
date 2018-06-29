// Initializes the `ethconversion` service on path `/ethconversion`
const createService = require('feathers-mongoose');
const createModel = require('../../models/ethconversion.model');
const hooks = require('./ethconversion.hooks');
const filters = require('./ethconversion.filters');

module.exports = function() {
  const app = this;
  const Model = createModel(app);
  const paginate = app.get('paginate');

  const options = {
    name: 'ethconversion',
    Model,
    paginate,
  };

  // Initialize our service with any options it requires
  app.use('/ethconversion', createService(options));

  // Get our initialized service so that we can register hooks and filters
  const service = app.service('ethconversion');

  service.hooks(hooks);

  if (service.filter) {
    service.filter(filters);
  }
};
