const rp = require('request-promise');
const logger = require('winston');

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
const _getRatesDb = async (app, timestamp, symbol = 'ETH') => {
  const resp = await app
    .service('conversionRates')
    .find({ query: { timestamp, symbol }, internal: true });

  if (resp.data.length > 0) return { _id: resp.data[0]._id, timestamp, rates: resp.data[0].rates };

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
const _getRatesCryptocompare = async (timestamp, ratesToGet, symbol) => {
  logger.debug(`Fetching coversion rates from crypto compare for: ${ratesToGet}`);
  const timestampMS = Math.round(timestamp / 1000);

  const rates = {};
  rates[symbol] = 1;

  // Fetch the conversion rate
  const promises = ratesToGet.map(async r => {
    if (r !== symbol) {
      const resp = JSON.parse(
        await rp(
          `https://min-api.cryptocompare.com/data/dayAvg?fsym=${symbol}&tsym=${r}&toTs=${timestampMS}&extraParams=giveth`,
        ),
      );

      if (resp && resp[r]) rates[r] = resp[r];
    }
  });

  // FIXME: This may throw some exceptions, this should probably be checked
  try {
    await Promise.all(promises);
  } catch (e) {
    logger.error(e);
  }

  return rates;
};

const getHourlyUSDRateCryptocompare = async (timestamp, tokenSymbol) => {
  const timestampMS = Math.round(timestamp / 1000);

  const resp = JSON.parse(
    await rp(
      `https://min-api.cryptocompare.com/data/histohour?fsym=${tokenSymbol}&tsym=USD&toTs=${timestampMS}&limit=1`,
    ),
  );

  const tsData = resp.Data.find(d => d.time === timestampMS);

  if (!tsData) throw new Error(`Failed to retrieve cryptocompare rate for ts: ${timestampMS}`);

  return ((tsData.high + tsData.low) / 2).toFixed(2);
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
const _saveToDB = (app, timestamp, rates, symbol, _id = undefined) => {
  // There already are some rates for this timestamp, update the record
  if (_id) return app.service('conversionRates').patch(_id, { rates });

  // Create new record
  return app.service('conversionRates').create({ timestamp, rates, symbol });
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
const getConversionRates = async (app, requestedDate, requestedSymbol = 'ETH') => {
  // Get yesterday date from today respecting UTC
  const yesterday = new Date(new Date().setUTCDate(new Date().getUTCDate() - 1));
  const yesterdayUTC = yesterday.setUTCHours(0, 0, 0, 0);

  // Parse the date for which the rate is requested
  const reqDate = requestedDate ? new Date(requestedDate) : yesterday;
  const reqDateUTC = reqDate.setUTCHours(0, 0, 0, 0);

  // Make sure that the date given is not in future or today
  // Only the rates for yesterday or older dates are final
  const timestamp = reqDateUTC < yesterdayUTC ? reqDateUTC : yesterdayUTC;

  const fiat = app.get('fiatWhitelist');

  logger.debug(`request eth conversion for timestamp ${timestamp}`);

  // Check if we already have this exchange rate for this timestamp, if not we save it
  const dbRates = await _getRatesDb(app, timestamp, requestedSymbol);
  const retrievedRates = new Set(Object.keys(dbRates.rates || {}));
  const unknownRates = fiat.filter(cur => !retrievedRates.has(cur));

  let { rates } = dbRates;

  if (unknownRates.length !== 0) {
    logger.debug('fetching eth coversion from crypto compare');
    // Some rates have not been obtained yet, get them from cryptocompare
    const newRates = await _getRatesCryptocompare(timestamp, unknownRates, requestedSymbol);
    rates = Object.assign({}, dbRates.rates, newRates);

    // Save the newly retrieved rates
    await _saveToDB(app, dbRates.timestamp, rates, requestedSymbol, dbRates._id);
  }

  return { timestamp: dbRates.timestamp, rates };
};

const getHourlyUSDCryptoConversion = async (app, ts, tokenSymbol = 'ETH') => {
  if (ts > Date.now()) throw new Error('Can not fetch crypto rate for future ts');

  // set the date to the top of the hour
  const requestTs = new Date(ts).setUTCMinutes(0, 0, 0);

  // Check if we already have this exchange rate for this timestamp, if not we save it
  const dbRates = await _getRatesDb(app, requestTs, tokenSymbol);
  const retrievedRates = new Set(Object.keys(dbRates.rates || {}));

  if (retrievedRates.has('USD')) {
    return { timestamp: dbRates.timestamp, rate: dbRates.rates.USD };
  }

  const rate = await getHourlyUSDRateCryptocompare(requestTs, tokenSymbol);
  try {
    await _saveToDB(app, requestTs, { USD: rate }, tokenSymbol);
  } catch (e) {
    // conflicts can happen when async fetching the same rate
    if (e.type !== 'FeathersError' && e.name !== 'Conflict') throw e;
  }

  return { timestamp: requestTs, rate };
};

// Query the conversion rate every minute
const queryConversionRates = app => {
  getConversionRates(app);

  // TODO: Do we actually need to do this in interval? Can't we just let it update when users request exchange rate?
  setInterval(() => {
    getConversionRates(app);
  }, MINUTE);
};

module.exports = {
  getConversionRates,
  queryConversionRates,
  getHourlyUSDCryptoConversion,
};
