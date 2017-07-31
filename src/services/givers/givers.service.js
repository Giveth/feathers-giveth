// Initializes the `givers` service on path `/givers`
const createService = require('feathers-nedb');
const createModel = require('../../models/givers.model');
const hooks = require('./givers.hooks');
const filters = require('./givers.filters');

module.exports = function () {
  const app = this;
  const Model = createModel(app);
  const paginate = app.get('paginate');

  const options = {
    name: 'givers',
    Model,
    paginate
  };

  // Initialize our service with any options it requires
  app.use('/givers', createService(options));

  // Get our initialized service so that we can register hooks and filters
  const service = app.service('givers');

  service.hooks(hooks);

  if (service.filter) {
    service.filter(filters);
  }
};
