const rp = require('request-promise');
const app = require('./../app');
import logger from './hooks/logger';

const fiat = ['USD', 'EUR'];

const MINUTE = 1000 * 60;

// Fetching eth conversion based on daily average from cryptocompare
// Returns a full json at the moment
export const getEthConversion = () => {
  logger.info('fetching eth coversion from crypto compare');

  let promises = [];
  const timestamp = Math.round((new Date()).getTime() / 1000);

  for (f in fiats) {
    promises.push(
      rp(`https://min-api.cryptocompare.com/data/dayAvg?fsym=ETH&tsym=${f}&toTs=${timestamp}&extraParams=giveth`)
    )
  }

  Promise.all(promises)
    .then(responses => {
      for (resp in responses) =>

      logger.info(respUSD, respEUR);
    })
    .catch((e) => logger.error('could not fetch eth conversions', e));
};

// query gas price every minute
export const queryEthConversion = () => {
  setInterval(() => {
    getEthConversion();
  }, MINUTE);
}