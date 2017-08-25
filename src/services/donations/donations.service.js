// Initializes the `donations` service on path `/donations`
const createService = require('feathers-nedb');
const createModel = require('../../models/donations.model');
const hooks = require('./donations.hooks');
const filters = require('./donations.filters');

module.exports = function () {
  const app = this;
  const Model = createModel(app);
  const paginate = app.get('paginate');

  const options = {
    name: 'donations',
    Model,
    paginate
  };

  // Initialize our service with any options it requires
  app.use('/donations', createService(options));

  // Get our initialized service so that we can register hooks and filters
  const service = app.service('donations');

  service.hooks(hooks);

  if (service.filter) {
    service.filter(filters);
  }
};
