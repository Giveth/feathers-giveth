// Initializes the `whitelist` service on path `/whitelist`
const createService = require('feathers-memory');

const hooks = require('./whitelist.hooks');

module.exports = function whitelist() {
  const app = this;

  const options = {
    name: 'whitelist',
  };

  // Initialize our service with any options it requires
  app.use('/whitelist', createService(options));

  // Get our initialized service so that we can register hooks and filters
  const service = app.service('whitelist');

  service.hooks(hooks);
};
