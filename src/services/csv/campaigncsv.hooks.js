const auth = require('@feathersjs/authentication');
const errors = require('@feathersjs/errors');

const authenticate = () => context => {
  // socket connection is already authenticated
  if (context.params.provider !== 'rest') return context;

  return auth.hooks.authenticate('jwt')(context);
};

const restrict = () => context => {
  const { user } = context.params;

  if (!user) throw new errors.NotAuthenticated();
};

module.exports = {
  before: {
    get: [authenticate(), restrict()],
  },
};
