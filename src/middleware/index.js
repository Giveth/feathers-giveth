import authenticate from './authenticate';

module.exports = function () {
  // Add your custom middleware here. Remember, that
  // in Express the order matters
  const app = this;

  app.use(authenticate);
};
