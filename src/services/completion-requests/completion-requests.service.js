// Initializes the `completion-requests` service on path `/completion-requests`
const createService = require('feathers-nedb');
const createModel = require('../../models/completion-requests.model');
const hooks = require('./completion-requests.hooks');
const filters = require('./completion-requests.filters');

module.exports = function () {
  const app = this;
  const Model = createModel(app);
  const paginate = app.get('paginate');

  const options = {
    name: 'completion-requests',
    Model,
    paginate
  };

  // Initialize our service with any options it requires
  app.use('/completion-requests', createService(options));

  // Get our initialized service so that we can register hooks and filters
  const service = app.service('completion-requests');

  service.hooks(hooks);

  if (service.filter) {
    service.filter(filters);
  }
};
