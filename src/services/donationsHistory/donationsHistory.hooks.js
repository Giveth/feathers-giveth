import { disallow } from 'feathers-hooks-common';
import onlyInternal from '../../hooks/onlyInternal';

export default {
  before: {
    all: [],
    find: [],
    get: [],
    create: [ onlyInternal() ],
    update: [ disallow() ],
    patch: [ disallow() ],
    remove: [ disallow() ],
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
