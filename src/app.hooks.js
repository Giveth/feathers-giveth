// Application hooks that run for every service
import logger from './hooks/logger';
import { restrictToAuthenticated } from 'feathers-authentication-hooks';

const excludableRestrictToAuthenticated = (...servicesToExclude) => {
  return context => {
    if (servicesToExclude.indexOf(context.path) > -1) return context;

    return restrictToAuthenticated()(context);
  };
};

export default {
  before: {
    all: [],
    find: [],
    get: [],
    create: [ excludableRestrictToAuthenticated('authentication') ],
    update: [ restrictToAuthenticated() ],
    patch: [ restrictToAuthenticated() ],
    remove: [ excludableRestrictToAuthenticated('authentication') ],
  },

  after: {
    all: [ logger() ],
    find: [],
    get: [],
    create: [],
    update: [],
    patch: [],
    remove: [],
  },

  error: {
    all: [ logger() ],
    find: [],
    get: [],
    create: [],
    update: [],
    patch: [],
    remove: [],
  },
};
