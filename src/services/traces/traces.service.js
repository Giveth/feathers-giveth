// Initializes the `traces` service on path `/traces`
const createService = require('feathers-mongoose');
const { createModel } = require('../../models/traces.model');
const hooks = require('./traces.hooks');
const { defaultFeatherMongooseOptions } = require('../serviceCommons');

module.exports = function milestones() {
  const app = this;
  const Model = createModel(app);
  const paginate = app.get('paginate');

  const options = {
    name: 'traces',
    Model,
    paginate,
    ...defaultFeatherMongooseOptions,
  };

  // Initialize our service with any options it requires
  app.use('/traces', createService(options));
  // Get our initialized service so that we can register hooks and filters
  const service = app.service('traces');
  service.hooks(hooks);
};
