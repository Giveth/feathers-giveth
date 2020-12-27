const rp = require('request-promise');
const logger = require('winston');
const { getTokenBySymbol } = require('../../utils/tokenHelper');
const { fetchCoingecko } = require('./coingecko');

const MINUTE = 1000 * 60;

/**
 * Get responses from the DB
 *
 * @throws Error if there has been DB issue
 *
 * @param {Object} app        Feathers app object
 * @param {Number} timestamp  Timestamp for which the rates should be retrieved
 * @param {String} symbol     The symbol to resolve the rate of
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
 * Get the rates from the coingecko API
 *
 * @throws Error if fetching the rates from coingecko API failed
 *
 * @param {Number} requestedSymbol   The rate symbol for the token being requested to be compared to
 * @param {Array}  timestampMS Timestamp requested for the rate
 * @param {Array}  coingeckoId the unique coingecko id needed for the token that the api needs
 * @param {Array}  ratestToGet Rates that are missing in the DB and should be retrieved
 *
 * @return {Object} Rates object in format { 0.241 }
 */
const _getRatesCoinGecko = async (requestedSymbol, timestampMS, coingeckoId, ratesToGet) => {
  const rates = {};
  rates[requestedSymbol] = 1;

  const promises = ratesToGet.map(async r => {
    const symbol = getTokenBySymbol(requestedSymbol).rateEqSymbol || requestedSymbol;
    if (symbol !== requestedSymbol) {
      rates[r] = await fetchCoingecko(timestampMS, coingeckoId, symbol);
    } else {
      rates[r] = 1;
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

  const requestSymbol = getTokenBySymbol(symbol).rateEqSymbol || symbol;
  // Fetch the conversion rate
  const promises = ratesToGet.map(async r => {
    const rateSymbol = getTokenBySymbol(r).rateEqSymbol || r;
    if (rateSymbol !== requestSymbol) {
      const resp = JSON.parse(
        await rp(
          `https://min-api.cryptocompare.com/data/dayAvg?fsym=${requestSymbol}&tsym=${rateSymbol}&toTs=${timestampMS}&extraParams=giveth`,
        ),
      );

      if (resp && resp[rateSymbol]) rates[r] = resp[rateSymbol];
    } else {
      rates[r] = 1;
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

/**
 * Get USD from the coingecko API
 *
 * @throws Error if fetching the rates from coingecko API failed
 *
 * @param {Array}  timestampMS Timestamp requested for the rate
 * @param {Object} from token
 * @param {Object} to token
 *
 * @return {Object} Rates object in format { 0.241 }
 */
const getHourlyRateCoingecko = async (timestampMS, fromToken, toToken = { symbol: 'USD' }) => {
  let rate = 1;

  if (!fromToken) return rate;

  const { coingeckoId: fromId, symbol: fromSymbol } = fromToken;
  const { coingeckoId: toId, symbol: toSymbol } = toToken;
  if (fromId && toId) {
    const [fromRate, toRate] = await Promise.all([
      fetchCoingecko(timestampMS, fromId, 'USD'),
      fetchCoingecko(timestampMS, toId, 'USD'),
    ]);
    rate = fromRate / toRate;
  } else if (fromId) {
    rate = await fetchCoingecko(timestampMS, fromId, toSymbol);
  } else if (toId) {
    rate = 1 / (await fetchCoingecko(timestampMS, toId, fromSymbol));
  } else {
    rate = 1;
  }

  return rate;
};

const getHourlyRateCryptocompare = async (timestamp, fromToken, toToken) => {
  const timestampMS = Math.round(timestamp / 1000);

  const resp = JSON.parse(
    await rp(
      `https://min-api.cryptocompare.com/data/histohour?fsym=${fromToken.rateEqSymbol ||
        fromToken.symbol}&tsym=${toToken.rateEqSymbol ||
        toToken.symbol}&toTs=${timestampMS}&limit=1`,
    ),
  );

  const tsData =resp && resp.Data && Array.isArray(resp.Data) && resp.Data.find(d => d.time === timestampMS);

  if (!tsData) {
    logger.error('getHourlyRateCryptocompare error', { timestampMS, resp, fromToken, toToken });
    throw new Error(`Failed to retrieve cryptocompare rate for ts: ${timestampMS}`);
  }
  return (tsData.high + tsData.low) / 2;
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
  return new Promise((resolve, reject) => {
    app
      .service('conversionRates')
      .patch(
        null,
        { timestamp, rates, symbol },
        { query: { timestamp, symbol }, mongoose: { upsert: true, writeResult: true } },
      )
      .then(r => resolve(r))
      .catch(e => {
        // Token may exists in db
        if (e.name === 'Conflict') {
          // eslint-disable-next-line consistent-return
          _getRatesDb(app, timestamp, symbol).then(r => {
            if (r._id) {
              return _saveToDB(app, timestamp, rates, symbol, r._id);
            }
            logger.error(e);
            reject(e);
          });
        } else {
          logger.error(e);
          reject(e);
        }
      });
  });
};

/**
 * Fetching eth conversion based on daily average from cryptocompare
 * Saves the conversion rates in the backend if we don't have it stored yet.timestamp
 *
 * @param {Object} app             Feathers app object
 * @param {Number} requestedDate   Optional requested date as number of miliseconds since 1.1.1970 UTC
 * @param {String} symbol          The symbol to resolve rates of
 *
 * @return {Promise} Promise that resolves to object {timestamp, rates: { EUR: 100, USD: 90 } }
 */
const getConversionRates = async (app, requestedDate, symbol = 'ETH') => {
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

  const token = getTokenBySymbol(symbol);

  // This field needed for PAN currency
  const { coingeckoId } = token;
  const requestedSymbol = token.rateEqSymbol || symbol;
  logger.debug(`request eth conversion for timestamp ${timestamp}`);

  // Check if we already have this exchange rate for this timestamp, if not we save it
  const dbRates = await _getRatesDb(app, timestamp, requestedSymbol);
  const retrievedRates = new Set(Object.keys(dbRates.rates || {}));
  const unknownRates = fiat.filter(cur => !retrievedRates.has(cur));

  let { rates } = dbRates;

  if (unknownRates.length !== 0) {
    logger.debug('fetching eth coversion from crypto compare');
    // Some rates have not been obtained yet, get them from cryptocompare
    let newRates = [];
    if (requestedSymbol === 'PAN') {
      newRates = await _getRatesCoinGecko(requestedSymbol, timestamp, coingeckoId, unknownRates);
    } else {
      newRates = await _getRatesCryptocompare(timestamp, unknownRates, requestedSymbol);
    }

    if (newRates === undefined || newRates === []) {
      return { timestamp: dbRates.timestamp, rates };
    }

    rates = { ...dbRates.rates, ...newRates };

    // Save the newly retrieved rates
    await _saveToDB(app, dbRates.timestamp, rates, requestedSymbol, dbRates._id);
  }

  return { timestamp: dbRates.timestamp, rates };
};

const getHourlyCryptoConversion = async (app, ts, fromSymbol = 'ETH', toSymbol = 'USD') => {
  if (ts > Date.now()) throw new Error('Can not fetch crypto rate for future ts');

  const lastHour = new Date();
  const lastHourUTC = lastHour.setUTCMinutes(0, 0, 0);

  // set the date to the top of the hour
  const requestTs = ts ? new Date(ts).setUTCMinutes(0, 0, 0) : lastHourUTC;

  // Return 1 for stable coins
  let fromToken = getTokenBySymbol(fromSymbol);
  let toToken = getTokenBySymbol(toSymbol);

  const normalizedFromSymbol = fromToken.rateEqSymbol || fromSymbol;
  const normalizedToSymbol = toToken.rateEqSymbol || toSymbol;

  if (normalizedFromSymbol === normalizedToSymbol) return { timestamp: requestTs, rate: 1 };

  fromToken = getTokenBySymbol(normalizedFromSymbol);
  toToken = getTokenBySymbol(normalizedToSymbol);

  // Check if we already have this exchange rate for this timestamp, if not we save it
  const dbRates = await _getRatesDb(app, requestTs, fromToken.symbol);
  const retrievedRates = new Set(Object.keys(dbRates.rates || {}));
  if (retrievedRates.has(normalizedToSymbol)) {
    return { timestamp: dbRates.timestamp, rate: dbRates.rates[normalizedToSymbol] };
  }

  let rate = 0;
  if ((fromToken.rateEqSymbol || fromToken.symbol) === (toToken.rateEqSymbol || toToken.symbol)) {
    rate = 1;
  } else if ([normalizedFromSymbol, normalizedToSymbol].includes('PAN')) {
    rate = await getHourlyRateCoingecko(requestTs, fromToken, toToken);
  } else {
    rate = await getHourlyRateCryptocompare(requestTs, fromToken, toToken);
  }
  try {
    const ratesToSave = { ...dbRates.rates };
    ratesToSave[normalizedToSymbol] = rate;
    await _saveToDB(app, requestTs, ratesToSave, normalizedFromSymbol);
  } catch (e) {
    // conflicts can happen when async fetching the same rate
    if (e.type !== 'FeathersError' && e.name !== 'Conflict') throw e;
  }

  return { timestamp: requestTs, rate };
};

const getHourlyMultipleCryptoConversion = async (
  app,
  ts,
  fromSymbol = 'ETH',
  toSymbols = ['USD'],
) => {
  const rates = {};
  let timestamp = null;
  return Promise.all(
    toSymbols.map(toSymbol => {
      return getHourlyCryptoConversion(app, ts, fromSymbol, toSymbol).then(result => {
        rates[toSymbol] = result.rate;
        timestamp = result.timestamp;
      });
    }),
  ).then(() => {
    return { timestamp, rates };
  });
};

const getHourlyUSDCryptoConversion = async (app, ts, fromSymbol = 'ETH') => {
  return getHourlyCryptoConversion(app, ts, fromSymbol, 'USD');
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
  // its just exported to can write test for it
  getHourlyRateCryptocompare,

  getConversionRates,
  queryConversionRates,
  getHourlyUSDCryptoConversion,
  getHourlyCryptoConversion,
  getHourlyMultipleCryptoConversion,
};
