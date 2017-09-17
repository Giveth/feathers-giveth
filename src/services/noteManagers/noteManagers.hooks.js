import commons from 'feathers-hooks-common';
import errors from 'feathers-errors';


const restrictToInternal = () => (context) => {
  if (context.params.provider !== undefined) {
    throw new errors.Forbidden();
  }

  return context;
};

const populateManager = () => (context) => {
  const fetchManager = (item) => {
    const service = context.app.service(item.type);
    return service.get(item.typeId);
  };

  const items = commons.getItems(context);

  Array.isArray(items) ? items.forEach((item) => {
    item.manager = fetchManager(item);
  }) : items.manager = fetchManager(items);

  commons.replaceItems(items);

  return context;
};


export default {
  before: {
    all: [],
    find: [],
    get: [],
    create: [ restrictToInternal() ],
    update: [ restrictToInternal() ],
    patch: [ restrictToInternal() ],
    remove: [ commons.disallow() ],
  },

  after: {
    all: [ populateManager(), commons.discard('_id') ],
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
