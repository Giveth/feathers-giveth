import commons from 'feathers-hooks-common';
import onlyInternal from '../../hooks/onlyInternal';
import { updatedAt, createdAt } from '../../hooks/timestamps';

const populateAdmin = () => (context) => {
  const fetchAdmin = (item) => {
    let serviceName;
    if (item.type === 'giver') serviceName = 'users';
    else if (item.type === 'dac') serviceName = 'dacs';
    else if (item.type === 'campaign') serviceName = 'campaigns';
    else if (item.type === 'milestone') serviceName = 'milestones';

    const service = context.app.service(serviceName);
    return service.get(item.typeId);
  };

  const items = commons.getItems(context);

  const promise = Array.isArray(items) ? Promise.all(items.map((item) => {
    return fetchAdmin(item)
      .then((admin) => {
        item.admin = admin;
      });
  })) : fetchAdmin(items).then((admin) => {
    items.admin = admin;
  });

  return promise.then(() => commons.replaceItems(items));
};


export default {
  before: {
    all: [],
    find: [],
    get: [],
    create: [ onlyInternal(), createdAt ],
    update: [ onlyInternal(), updatedAt ],
    patch: [ onlyInternal(), updatedAt ],
    remove: [ commons.disallow() ],
  },

  after: {
    all: [ populateAdmin(), commons.discard('_id') ],
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
