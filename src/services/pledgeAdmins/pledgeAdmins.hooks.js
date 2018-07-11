import commons from 'feathers-hooks-common';
import onlyInternal from '../../hooks/onlyInternal';

const { AdminTypes } = require('../../models/pledgeAdmins.model');

const populateAdmin = () => context => {
  const fetchAdmin = item => {
    let serviceName;
    if (item.type === AdminTypes.GIVER) serviceName = 'users';
    else if (item.type === AdminTypes.DAC) serviceName = 'dacs';
    else if (item.type === AdminTypes.CAMPAIGN) serviceName = 'campaigns';
    else if (item.type === AdminTypes.MILESTONE) serviceName = 'milestones';

    const service = context.app.service(serviceName);
    return service.get(item.typeId);
  };

  const items = commons.getItems(context);

  const promise = Array.isArray(items)
    ? Promise.all(
        items.map(item =>
          fetchAdmin(item).then(admin => {
            item.admin = admin;
          }),
        ),
      )
    : fetchAdmin(items).then(admin => {
        items.admin = admin;
      });

  return promise.then(() => commons.replaceItems(items));
};

export default {
  before: {
    all: [],
    find: [],
    get: [],
    create: [onlyInternal()],
    update: [onlyInternal()],
    patch: [onlyInternal()],
    remove: [commons.disallow()],
  },

  after: {
    all: [populateAdmin(), commons.discard('_id')],
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
