// Initializes the `whitelist` service on path `/whitelist`
const createService = require('feathers-memory');
const filters = require('./whitelist.filters');
const hooks = require('feathers-hooks');
import errors from 'feathers-errors';


module.exports = function () {
  const app = this;

  const options = {
    name: 'whitelist'
  };
 
  // Initialize our service with any options it requires
  app.use('/whitelist', createService(options));

  // Get our initialized service so that we can register hooks and filters
  const service = app.service('whitelist');

  service.hooks({
    after: {
      find: [ hook => {
        hook.result = {
          reviewerWhitelist: app.get('reviewerWhitelist').map(addr => addr.toLowerCase()),
          delegateWhitelist: app.get('delegateWhitelist').map(addr => addr.toLowerCase()),
          projectOwnerWhitelist: app.get('projectOwnerWhitelist').map(addr => addr.toLowerCase())
        };
        return hook
      } ],
    }
  });

  if (service.filter) {
    service.filter(filters);
  }
};
