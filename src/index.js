/* eslint-disable no-console */
const logger = require('winston');
const app = require('./app');
const port = app.get('port');
const server = app.listen(port);
import queryGasPrice from './blockchain/gasPriceService';

process.on('unhandledRejection', (reason, p) =>
  logger.error('Unhandled Rejection at: Promise ', p, reason)
);

server.on('listening', () => {
  logger.info(`Feathers application started on ${app.get('host')}:${port}`)
  logger.info(`Using DappMailer url ${app.get('dappMailerUrl')}`)
});

queryGasPrice();
