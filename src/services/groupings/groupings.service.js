// Initializes the `groupings` service on path `/groupings`
const createService = require('feathers-nedb');
const createModel = require('../../models/groupings.model');
const hooks = require('./groupings.hooks');
const filters = require('./groupings.filters');

module.exports = function () {
  const app = this;
  const Model = createModel(app);
  const paginate = app.get('paginate');

  const options = {
    name: 'groupings',
    Model,
    paginate
  };

  // Initialize our service with any options it requires
  app.use('/groupings', createService(options));

  // Get our initialized service so that we can register hooks and filters
  const service = app.service('groupings');

  service.hooks(hooks);

  if (service.filter) {
    service.filter(filters);
  }
};
