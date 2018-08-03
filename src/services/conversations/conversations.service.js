// Initializes the `conversations` service on path `/conversations`
const createService = require('feathers-mongoose');
const createModel = require('../../models/conversations.model');
const hooks = require('./conversations.hooks');

module.exports = function conversations() {
  const app = this;
  const Model = createModel(app);
  const paginate = app.get('paginate');

  const options = {
    name: 'conversations',
    Model,
    paginate,
  };

  // Initialize our service with any options it requires
  app.use('/conversations', createService(options));

  // Get our initialized service so that we can register hooks and filters
  const service = app.service('conversations');

  service.hooks(hooks);
};
