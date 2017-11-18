import onlyInternal from '../../hooks/onlyInternal';

export default {
  before: {
    all: [],
    find: [],
    get: [],
    create: [ onlyInternal() ],
    update: [ onlyInternal() ],
    patch: [ onlyInternal() ],
    remove: [ onlyInternal() ],
  },

  after: {
    all: [],
    find: [],
    get: [],
    create: [],
    update: [],
    patch: [],
    remove: [],
  },

  error: {
    all: [],
    find: [],
    get: [],
    create: [],
    update: [],
    patch: [],
    remove: [],
  },
};
