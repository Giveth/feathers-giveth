const skunkworks = require('./skunkworks/skunkworks.service.js');
module.exports = function () {
  const app = this; // eslint-disable-line no-unused-vars
  app.configure(skunkworks);
};
