const { disallow } = require('feathers-hooks-common');

module.exports = {
  before: {
    all: [],
    get: [disallow()],
    create: [disallow()],
    remove: [disallow()],
  },

  after: {
    all: [],
    get: [],
    create: [],
    remove: [],
  },

  error: {
    all: [],
    get: [],
    create: [],
    remove: [],
  },
};
