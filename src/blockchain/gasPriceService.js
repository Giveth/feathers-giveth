const logger = require('winston');
const rp = require('request-promise');
const Sentry = require('@sentry/node');
const { getFeatherAppInstance } = require('../app');

const FIVE_MINUTES = 1000 * 60 * 5;

// Fetching gasprice and making it available within feathers as app.gasPrice
// Usage within app: app.get('gasPrice')
// Returns a full json at the moment
const queryGasPrice = () => {
  const app = getFeatherAppInstance();
  logger.debug('fetching gas price = require(ethgasstation');
  return rp('https://ethgasstation.info/json/ethgasAPI.json')
    .then(resp => {
      const data = JSON.parse(resp);
      app.set('gasPrice', data);
      return data;
    })
    .catch(e => {
      Sentry.captureException(e);
      logger.error('could not fetch gas = require(ethgasstation', e.statusCode || e);
    });
};

// query gas price every minute
setInterval(() => {
  queryGasPrice();
}, FIVE_MINUTES);

module.exports = queryGasPrice;
