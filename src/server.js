const logger = require('winston');
const queryGasPrice = require('./blockchain/gasPriceService');
const { queryConversionRates } = require('./services/conversionRates/getConversionRatesService');
const { initFeatherApp } = require('./app');
const { initHandlingGivethIoUpdateEvents } = require('./utils/givethIoSyncer');

const app = initFeatherApp();
const startServer = async () => {
  const port = app.get('port');
  const server = await app.listen(port);

  server.on('listening', () => {
    logger.info(`Feathers application started on ${app.get('host')}:${port}`);
    logger.info(`Using DappMailer url ${app.get('dappMailerUrl')}`);
  });

  queryGasPrice();
  queryConversionRates(app);
  initHandlingGivethIoUpdateEvents(app);

  return server;
};
module.exports = {
  startServer,
};
