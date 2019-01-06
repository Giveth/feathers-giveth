const queryGasPrice = require('./blockchain/gasPriceService');
const { queryConversionRates } = require('./services/conversionRates/getConversionRatesService');

const logger = require('winston');
const app = require('./app');

const port = app.get('port');
const server = app.listen(port);

server.on('listening', () => {
  logger.info(`Feathers application started on ${app.get('host')}:${port}`);
  logger.info(`Using DappMailer url ${app.get('dappMailerUrl')}`);
});

queryGasPrice();
queryConversionRates(app);
