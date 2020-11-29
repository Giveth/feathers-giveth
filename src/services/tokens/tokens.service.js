// Initializes the `tokens` service on path `/tokens`
const createService = require('feathers-mongoose');
const { createModel } = require('../../models/token.model');
const hooks = require('./tokens.hooks');

module.exports = function tokens() {
  const app = this;
  const Model = createModel(app);
  const paginate = app.get('paginate');

  const options = {
    name: 'tokens',
    Model,
    paginate,
  };

  // Initialize our service with any options it requires
  app.use('/tokens', createService(options));

  // Get our initialized service so that we can register hooks and filters
  const service = app.service('tokens');

  service.hooks(hooks);
};
