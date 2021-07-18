// Initializes the `communities` service on path `/communities`
const createService = require('feathers-mongoose');
const { createModel } = require('../../models/communities.model');
const hooks = require('./communities.hooks');
const { defaultFeatherMongooseOptions } = require('../serviceCommons');

module.exports = function communities() {
  const app = this;
  const Model = createModel(app);
  const paginate = app.get('paginate');

  const options = {
    name: 'communities',
    Model,
    paginate,
    ...defaultFeatherMongooseOptions,
  };

  // Initialize our service with any options it requires
  app.use('/communities', createService(options));

  // Get our initialized service so that we can register hooks and filters
  const service = app.service('communities');

  service.hooks(hooks);
};
