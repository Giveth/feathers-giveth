// Initializes the `dacs` service on path `/dacs`
const createService = require('feathers-mongoose');
const { createModel } = require('../../models/dacs.model');
const hooks = require('./dacs.hooks');

module.exports = function dacs() {
  const app = this;
  const Model = createModel(app);
  const paginate = app.get('paginate');

  const options = {
    name: 'dacs',
    Model,
    paginate,
  };

  // Initialize our service with any options it requires
  app.use('/dacs', createService(options));

  // Get our initialized service so that we can register hooks and filters
  const service = app.service('dacs');

  service.hooks(hooks);
};
