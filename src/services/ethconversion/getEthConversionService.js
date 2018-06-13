const rp = require('request-promise');
const logger = require('winston');

const fiat = ['BRL', 'CAD', 'CHF', 'CZK', 'EUR', 'GBP', 'MXN', 'THB', 'USD'];
const MINUTE = 1000 * 60;

const _buildResponse = (timestamp, rates) => {
  rates.ETH = 1; // adding eth-eth conversion in the response

  return {
    timestamp,
    rates,
  };
};

/**
 * Fetching eth conversion based on daily average from cryptocompare
 * Saves the conversion rates in the backend if we don't have it stored yet.timestamp
 *
 * @param {Object} app             Feathers app object
 * @param {Number} requestedData   Optional requested date as number of miliseconds since 1.1.1970 UTC
 */
export const getEthConversion = (app, requestedDate) => {
  // Get yesterday date
  const yesterday = new Date(new Date().setDate(new Date().getDate() - 1));
  const yesterdayUTC = yesterday.setUTCHours(0, 0, 0, 0);

  // Parse the date for which the rate is requested
  const reqDate = requestedDate ? new Date(requestedDate) : yesterday;
  const reqDateUTC = reqDate.setUTCHours(0, 0, 0, 0);

  // Make sure that the date given is not in future or today
  // Only the rates for yesterday or older dates are final
  const startDate = reqDateUTC < yesterdayUTC ? reqDateUTC : yesterdayUTC;

  // Create timestamp in seconds, as accepted by cryptocompare
  const timestamp = Math.round(startDate) / 1000;

  logger.debug(`request eth conversion for timestamp ${timestamp}`);

  // check if we already have this exchange rate for this timestamp, if not we save it
  return new Promise((resolve, reject) => {
    app
      .service('ethconversion')
      .find({ query: { timestamp }, internal: true })
      .then(rates => {
        if (rates.data.length > 0) {
          resolve(_buildResponse(rates.data[0].timestamp, rates.data[0].rates));
        } else {
          logger.debug('fetching eth coversion from crypto compare');

          // fetch daily avg for each fiat
          const promises = fiat.map(f =>
            rp(
              `https://min-api.cryptocompare.com/data/dayAvg?fsym=ETH&tsym=${f}&toTs=${timestamp}&extraParams=giveth`,
            ),
          );
          const exchangeRates = {};

          Promise.all(promises)
            .then(responses => {
              responses.forEach(resp => {
                resp = JSON.parse(resp);

                Object.keys(resp).forEach(key => {
                  if (fiat.includes(key)) {
                    exchangeRates[key] = resp[key];
                  }
                });
              });

              app
                .service('ethconversion')
                .create({
                  timestamp,
                  rates: exchangeRates,
                })
                .then(() => {
                  resolve(_buildResponse(timestamp, exchangeRates));
                });
            })
            .catch(e => {
              logger.error('could not fetch eth conversions from crypto compare', e);
              reject();
            });
        }
      });
  });
};

// query gas price every minute
export const queryEthConversion = app => {
  getEthConversion(app);

  setInterval(() => {
    getEthConversion(app);
  }, MINUTE);
};
