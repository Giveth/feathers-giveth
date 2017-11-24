const getWhitelist = () => (context) => {
  context.result = {
    reviewerWhitelist: context.app.get('reviewerWhitelist').map(addr => addr.toLowerCase()),
    delegateWhitelist: context.app.get('delegateWhitelist').map(addr => addr.toLowerCase()),
    projectOwnerWhitelist: context.app.get('projectOwnerWhitelist').map(addr => addr.toLowerCase())
  };

  return context;
};

export default {
  before: {
    all: [],
    find: [],
    get: [],
    create: [],
    update: [],
    patch: [],
    remove: [],
  },

  after: {
    all: [],
    find: [ getWhitelist()],
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
