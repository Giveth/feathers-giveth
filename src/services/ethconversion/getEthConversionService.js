const rp = require('request-promise');
const logger = require('winston');

const fiat = ['AUD', 'BRL', 'CAD', 'CHF', 'CZK', 'EUR', 'GBP', 'MXN', 'THB', 'USD'];
const MINUTE = 1000 * 60;

/**
 * Get responses from the DB
 *
 * @throws Error if there has been DB issue
 *
 * @param {Object} app        Feathers app object
 * @param {Number} timestamp  Timestamp for which the rates should be retrieved
 *
 * @return {Object} Object in format { _id, timestamp, rates: { EUR: 100, USD: 90 } }
 */
const _getRatesDb = async (app, timestamp) => {
  const resp = await app.service('ethconversion').find({ query: { timestamp }, internal: true });

  if (resp.data.length > 0)
    return { _id: resp.data[0]._id, timestamp: resp.data[0].timestamp, rates: resp.data[0].rates };

  // There is no rate in cache
  return { timestamp, rates: {} };
};

/**
 * Get the rates from the cryptocompare API
 *
 * @throws Error if fetching the rates from cryptocompare API failed
 *
 * @param {Number} timestamp   Timestamp for which the value should be retrieved
 * @param {Array}  ratestToGet Rates that are missing in the DB and should be retrieved
 *
 * @return {Object} Rates object in format { EUR: 241, USD: 123 }
 */
const _getRatesCryptocompare = async (timestamp, ratesToGet) => {
  logger.debug(`Fetching eth coversion from crypto compare for: ${ratesToGet}`);

  const timestampMS = Math.round(timestamp / 1000);

  const promises = ratesToGet.map(f =>
    rp(
      `https://min-api.cryptocompare.com/data/dayAvg?fsym=ETH&tsym=${f}&toTs=${timestampMS}&extraParams=giveth`,
    ),
  );

  const responses = await Promise.all(promises);

  const rates = {};
  responses.forEach(resp => {
    const response = JSON.parse(resp);

    Object.keys(response).forEach(key => {
      if (fiat.includes(key)) rates[key] = response[key];
    });
  });

  return rates;
};

/**
 * Save the rates to the DB by either creating new record or updating existing one
 *
 * @param {Object} app        Feathers app object
 * @param {Number} timestamp  Timestamp for which the rates should be stored
 * @param {Object} rates      Rates to be stored in the DB
 * @param {Number} id         Optional ID if there already is a record
 *
 * @return {Promise} Resolves if the rates were saved correctly
 */
const _saveToDB = (app, timestamp, rates, _id = undefined) => {
  // There already are some rates for this timestamp, update the record
  if (_id) return app.service('ethconversion').patch(_id, { rates });

  // Create new record
  return app.service('ethconversion').create({ timestamp, rates });
};

/**
 * Fetching eth conversion based on daily average from cryptocompare
 * Saves the conversion rates in the backend if we don't have it stored yet.timestamp
 *
 * @param {Object} app             Feathers app object
 * @param {Number} requestedData   Optional requested date as number of miliseconds since 1.1.1970 UTC
 *
 * @return {Promise} Promise that resolves to object {timestamp, rates: { EUR: 100, USD: 90 } }
 */
export const getEthConversion = (app, requestedDate) => {
  // Get yesterday date from today respecting UTC
  const yesterday = new Date(new Date().setUTCDate(new Date().getUTCDate() - 1));
  const yesterdayUTC = yesterday.setUTCHours(0, 0, 0, 0);

  // Parse the date for which the rate is requested
  const reqDate = requestedDate ? new Date(requestedDate) : yesterday;
  const reqDateUTC = reqDate.setUTCHours(0, 0, 0, 0);

  // Make sure that the date given is not in future or today
  // Only the rates for yesterday or older dates are final
  const timestamp = reqDateUTC < yesterdayUTC ? reqDateUTC : yesterdayUTC;

  logger.debug(`request eth conversion for timestamp ${timestamp}`);

  // Check if we already have this exchange rate for this timestamp, if not we save it
  return new Promise(async (resolve, reject) => {
    try {
      const dbRates = await _getRatesDb(app, timestamp);

      const retrievedRates = new Set(Object.keys(dbRates.rates || {}));
      const unknownRates = fiat.filter(cur => !retrievedRates.has(cur));

      let { rates } = dbRates;

      if (unknownRates.length !== 0) {
        logger.debug('fetching eth coversion from crypto compare');
        // Some rates have not been obtained yet, get them from cryptocompare
        const newRates = await _getRatesCryptocompare(timestamp, unknownRates);
        rates = Object.assign({}, dbRates.rates, newRates);

        // Save the newly retrieved rates
        await _saveToDB(app, dbRates.timestamp, rates, dbRates._id);
      }

      resolve({ timestamp: dbRates.timestamp, rates });
    } catch (e) {
      reject(e);
    }
  });
};

// Query the conversion rate every minute
export const queryEthConversion = app => {
  getEthConversion(app);

  // TODO: Do we actually need to do this in interval? Can't we just let it update when users request exchange rate?
  setInterval(() => {
    getEthConversion(app);
  }, MINUTE);
};
