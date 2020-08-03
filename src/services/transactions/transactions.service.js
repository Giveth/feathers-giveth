// Initializes the `transactions` model and save it in app
const { createModel } = require('../../models/transactions.model');

module.exports = function serviceFactory() {
  const app = this;
  const Model = createModel(app);

  // Save transaction model
  app.set('transactionsModel', Model);
};
