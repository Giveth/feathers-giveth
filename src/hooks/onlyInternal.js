const errors = require('@feathersjs/errors');
const { isRequestInternal } = require('../utils/feathersUtils');
module.exports = () => context => {
  if (!isRequestInternal(context)) {
    throw new errors.Forbidden();
  }
  return context;
};
