// Application hooks that run for every service
const logger = require('./hooks/logger');
import { restrictToAuthenticated } from 'feathers-authentication-hooks';

module.exports = {
  before: {
    all: [],
    find: [],
    get: [],
    create: [ restrictToAuthenticated() ],
    update: [ restrictToAuthenticated() ],
    patch: [ restrictToAuthenticated() ],
    remove: [ restrictToAuthenticated() ],
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
