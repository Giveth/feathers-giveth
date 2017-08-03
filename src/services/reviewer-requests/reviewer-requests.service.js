// Initializes the `reviewer-requests` service on path `/reviewer-requests`
const createService = require('feathers-nedb');
const createModel = require('../../models/reviewer-requests.model');
const hooks = require('./reviewer-requests.hooks');
const filters = require('./reviewer-requests.filters');

module.exports = function () {
  const app = this;
  const Model = createModel(app);
  const paginate = app.get('paginate');

  const options = {
    name: 'reviewer-requests',
    Model,
    paginate
  };

  // Initialize our service with any options it requires
  app.use('/reviewer-requests', createService(options));

  // Get our initialized service so that we can register hooks and filters
  const service = app.service('reviewer-requests');

  service.hooks(hooks);

  if (service.filter) {
    service.filter(filters);
  }
};
