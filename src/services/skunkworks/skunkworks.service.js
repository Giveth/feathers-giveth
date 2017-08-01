// Initializes the `skunkworks` service on path `/skunkworks`
const createService = require('feathers-nedb');
const createModel = require('../../models/skunkworks.model');
const hooks = require('./skunkworks.hooks');
const filters = require('./skunkworks.filters');

module.exports = function () {
  const app = this;
  const Model = createModel(app);
  const paginate = app.get('paginate');

  const options = {
    name: 'skunkworks',
    Model,
    paginate
  };

  // Initialize our service with any options it requires
  app.use('/skunkworks', createService(options));

  // Get our initialized service so that we can register hooks and filters
  const service = app.service('skunkworks');

  service.hooks(hooks);

  if (service.filter) {
    service.filter(filters);
  }
};
