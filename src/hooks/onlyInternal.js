const errors = require('@feathersjs/errors');

module.exports = () => context => {
  if (context.params.provider !== undefined) {
    throw new errors.Forbidden();
  }

  return context;
};
