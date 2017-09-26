import commons from 'feathers-hooks-common';
import onlyInternal from '../../hooks/onlyInternal';

const populateManager = () => (context) => {
  const fetchManager = (item) => {
    const service = context.app.service(item.type);
    return service.get(item.typeId);
  };

  const items = commons.getItems(context);

  const promise = Array.isArray(items) ? Promise.all(items.map((item) => {
    return fetchManager(item)
      .then((manager) => {
        item.manager = manager;
      });
  })) : fetchManager(items).then((manager) => {
    items.manager = manager;
  });

  return promise.then(() => commons.replaceItems(items));
};


export default {
  before: {
    all: [],
    find: [],
    get: [],
    create: [ onlyInternal() ],
    update: [ onlyInternal() ],
    patch: [ onlyInternal() ],
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
