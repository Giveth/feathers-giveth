// Initializes the `causes` service on path `/causes`
const createService = require('feathers-nedb');
const createModel = require('../../models/causes.model');
const hooks = require('./causes.hooks');
const filters = require('./causes.filters');

module.exports = function () {
  const app = this;
  const Model = createModel(app);
  const paginate = app.get('paginate');

  const options = {
    name: 'causes',
    Model,
    paginate
  };

  // Initialize our service with any options it requires
  app.use('/causes', createService(options));

  // Get our initialized service so that we can register hooks and filters
  const service = app.service('causes');

  service.hooks(hooks);

  if (service.filter) {
    service.filter(filters);
  }
};
