const rp = require('request-promise');
const logger = require('winston');

const fiat = ['USD', 'EUR', 'GBP', 'CHF', 'MXN', 'THB', 'CZK', 'BRL'];
const MINUTE = 1000 * 60;


const _buildResponse = (timestamp, rates) => ({
  timestamp: timestamp,
  rates: rates
})

/**
 Fetching eth conversion based on daily average from cryptocompare
 Saves the conversion rates in the backend if we don't have it stored yet.timestamp

 @params:
    app: include the app object, won't work without for some reason
    requestedData (Date): optional requested date, defaults to new Date()
 **/

export const getEthConversion = (app, requestedDate) => {
  const date = requestedDate ? new Date(requestedDate) : new Date();
  const startDate = date.setUTCHours(0,0,0,0);      // set at start of the day
  const timestamp = Math.round(startDate) / 1000;   // create timestamp in seconds, as accepted by cryptocompare

  logger.debug(`request eth conversion for timestamp ${timestamp}`);

  // check if we already have this exchange rate for this timestamp, if not we save it
  return new Promise((resolve, reject) => {  
    app.service('ethconversion').find({query: { timestamp: timestamp}, internal: true})
      .then((rates) => {
        if(rates.data.length > 0) {
          resolve(_buildResponse(rates.data[0].timestamp, rates.data[0].rates));          
        } else {
          logger.debug('fetching eth coversion from crypto compare');

          // fetch daily avg for each fiat
          let promises = fiat.map(f => rp(`https://min-api.cryptocompare.com/data/dayAvg?fsym=ETH&tsym=${f}&toTs=${timestamp}&extraParams=giveth`))
          let exchangeRates = {};

          Promise.all(promises)
            .then(responses => {
              responses.forEach((resp) => {
                resp = JSON.parse(resp);

                Object.keys(resp).forEach((key) => {
                  if(fiat.includes(key)) {
                    exchangeRates[key] = resp[key]
                  }
                })
              });

              app.service('ethconversion').create({
                timestamp: timestamp,
                rates: exchangeRates
              }).then(() => {
                resolve(_buildResponse(timestamp, exchangeRates));
              })
            })
            .catch((e) => {
              logger.error('could not fetch eth conversions from crypto compare', e);
              reject();
            });
        }
      });
  });
}

// query gas price every minute
export const queryEthConversion = (app) => {
  getEthConversion(app);

  setInterval(() => {
    getEthConversion(app);
  }, MINUTE);
}