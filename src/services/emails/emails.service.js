const createService = require('feathers-mongoose');
const { createModel } = require('../../models/emails.model');
const hooks = require('./emails.hooks');
const { defaultFeatherMongooseOptions } = require('../serviceCommons');

module.exports = function emails() {
  const app = this;
  const Model = createModel(app);
  const paginate = app.get('paginate');

  const options = {
    name: 'emails',
    Model,
    paginate,
    ...defaultFeatherMongooseOptions,
  };

  // Initialize our service with any options it requires
  app.use('/emails', createService(options));

  // Get our initialized service so that we can register hooks and filters
  const service = app.service('emails');

  service.hooks(hooks);
};
