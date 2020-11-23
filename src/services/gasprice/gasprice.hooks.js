const DEFAULT_PRICE = 100; // ethGasStation returns price in 10 gweis. 100 is really 10 gwei

const getGasPrice = () => context => {
  context.result = context.app.get('gasPrice') || {
    safeLow: DEFAULT_PRICE,
    average: DEFAULT_PRICE,
  };
  return context;
};

// TODO I think the all method should be disallowed except GET method
module.exports = {
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
    find: [getGasPrice()],
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
