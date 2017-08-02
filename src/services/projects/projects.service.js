// Initializes the `projects` service on path `/projects`
const createService = require('feathers-nedb');
const createModel = require('../../models/projects.model');
const hooks = require('./projects.hooks');
const filters = require('./projects.filters');

module.exports = function () {
  const app = this;
  const Model = createModel(app);
  const paginate = app.get('paginate');

  const options = {
    name: 'projects',
    Model,
    paginate
  };

  // Initialize our service with any options it requires
  app.use('/projects', createService(options));

  // Get our initialized service so that we can register hooks and filters
  const service = app.service('projects');

  service.hooks(hooks);

  if (service.filter) {
    service.filter(filters);
  }
};
