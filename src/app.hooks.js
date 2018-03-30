// Application hooks that run for every service
import { restrictToAuthenticated } from 'feathers-authentication-hooks';
import auth from 'feathers-authentication';
import logger from './hooks/logger';

const excludableRestrictToAuthenticated = (...servicesToExclude) => context => {
  if (servicesToExclude.indexOf(context.path) > -1) return context;

  return restrictToAuthenticated()(context);
};

const authenticate = () => context => {
  // socket connection is already authenticated
  if (context.params.provider !== 'rest') return context;

  return auth.hooks.authenticate('jwt')(context);
};

export default {
  before: {
    all: [],
    find: [],
    get: [],
    create: [authenticate(), excludableRestrictToAuthenticated('authentication')],
    update: [authenticate(), restrictToAuthenticated()],
    patch: [authenticate(), restrictToAuthenticated()],
    remove: [authenticate(), excludableRestrictToAuthenticated('authentication')],
  },

  after: {
    all: [logger()],
    find: [],
    get: [],
    create: [],
    update: [],
    patch: [],
    remove: [],
  },

  error: {
    all: [logger()],
    find: [],
    get: [],
    create: [],
    update: [],
    patch: [],
    remove: [],
  },
};
