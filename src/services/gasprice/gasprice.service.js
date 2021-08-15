const DEFAULT_PRICE = 100; // ethGasStation returns price in 10 gweis. 100 is really 10 gwei

module.exports = function gasPrice() {
  const app = this;

  const gasPriceService = {
    async find() {
      return (
        app.get('gasPrice') || {
          safeLow: DEFAULT_PRICE,
          average: DEFAULT_PRICE,
        }
      );
    },
  };

  gasPriceService.docs = {
    operations: {
      find: {
        'parameters[0]': undefined,
        'parameters[1]': undefined,
        'parameters[2]': undefined,
        'parameters[3]': undefined,
      },
      update: false,
      patch: false,
      remove: false,
      get: false,
      create: false,
    },
    definition: {},
  };

  // Initialize our service with any options it requires
  app.use('/gasprice', gasPriceService);
};
