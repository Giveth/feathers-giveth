const logger = require('winston');
const rp = require('request-promise');
const app = require('./../app');

const FIVE_MINUTES = 1000 * 60 * 5;

// Fetching gasprice and making it available within feathers as app.gasPrice
// Usage within app: app.get('gasPrice')
// Returns a full json at the moment
const queryGasPrice = () => {
  logger.debug('fetching gas price = require(ethgasstation');
  return rp('https://ethgasstation.info/json/ethgasAPI.json')
    .then(resp => app.set('gasPrice', JSON.parse(resp)))
    .catch(e => {
      logger.error('could not fetch gas = require(ethgasstation', e.statusCode || e);
    });
};

// query gas price every minute
setInterval(() => {
  queryGasPrice();
}, FIVE_MINUTES);

module.exports = queryGasPrice;
