// Initializes the `conversionRates` service on path `/conversionRates`
const createService = require('feathers-mongoose');
const createModel = require('../../models/conversionRates.model');
const hooks = require('./conversionRates.hooks');

module.exports = function conversionRates() {
  const app = this;
  const Model = createModel(app);
  const paginate = app.get('paginate');

  const options = {
    name: 'conversionRates',
    Model,
    paginate,
  };

  // Initialize our service with any options it requires
  app.use('/conversionRates', createService(options));

  // Get our initialized service so that we can register hooks and filters
  const service = app.service('conversionRates');

  service.hooks(hooks);
};
