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
 * Get the rates from the coingecko API
 *
 * @throws Error if fetching the rates from coingecko API failed
 *
 * @param {Number} rateSymbol   The rate symbol for the token being requested to be compared to
 * @param {Array}  timestampMS Timestamp requested for the rate
 * @param {Array}  coingeckoId the unique coingecko id needed for the token that the api needs
 * @param {Array}  ratestToGet Rates that are missing in the DB and should be retrieved
 * @param {Array}  stableCoins coins whose value equal one usd
 *
 * @return {Object} Rates object in format { 0.241 }
 */
const _getRatesCoinGecko = async (
  rateSymbol,
  timestampMS,
  coingeckoId,
  ratesToGet,
  stableCoins,
) => {
  const rates = {};
  rates[rateSymbol] = 1;

  const promises = ratesToGet.map(async r => {
    const rateSymbolInner = stableCoins.includes(r) ? 'USD' : r;
    if (rateSymbolInner !== rateSymbol) {
      const timestampTo = Math.round(timestampMS / 1000);
      const timestampFrom = timestampTo - 3600 * 12;
      let bestPrice = 1;
      const testRep = JSON.parse(
        await rp(
          `https://api.coingecko.com/api/v3/coins/${coingeckoId}/market_chart/range?vs_currency=${rateSymbolInner}&from=${timestampFrom}&to=${timestampTo}`,
        ),
      );

      if (testRep) {
        let difference = 0;
        let bestIndex = 0;
        let bestDifference = Infinity;
        let i;
        let cur;
        let priceTime;

        const { prices } = testRep;
        for (i = 0; i < prices.length; i += 1) {
          cur = prices[i];
          priceTime = Math.round(cur[0] / 1000);
          difference = Math.abs(timestampTo - priceTime);
          if (difference < bestDifference) {
            bestDifference = difference;
            bestIndex = i;
          }
        }
        const bestPrices = prices[bestIndex];
        const [, price] = bestPrices;
        bestPrice = price;
      } else {
        bestPrice = 1;
      }
      rates[r] = bestPrice;
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
 * @param {Array}  stableCoins coins whose value equal one usd
 *
 * @return {Object} Rates object in format { EUR: 241, USD: 123 }
 */
const _getRatesCryptocompare = async (timestamp, ratesToGet, symbol, stableCoins) => {
  logger.debug(`Fetching coversion rates from crypto compare for: ${ratesToGet}`);
  const timestampMS = Math.round(timestamp / 1000);

  const rates = {};
  rates[symbol] = 1;

  const requestSymbol = stableCoins.includes(symbol) ? 'USD' : symbol;
  // Fetch the conversion rate
  const promises = ratesToGet.map(async r => {
    const rateSymbol = stableCoins.includes(r) ? 'USD' : r;
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
 * @param {Number} rateSymbol   The rate symbol for the token being requested to be compared to
 * @param {Array}  timestampMS Timestamp requested for the rate
 * @param {string}  coingeckoId the unique coingecko id needed for the token that the api needs
 *
 * @return {Object} Rates object in format { 0.241 }
 */
const getHourlyUSDRateCoingecko = async (rateSymbol, timestampMS, coingeckoId = '') => {
  let rate = 0;

  if (rateSymbol) {
    const timestampTo = Math.round(timestampMS / 1000);
    const timestampFrom = timestampTo - 3600 * 12;
    let bestPrice = 1;
    const testRep = JSON.parse(
      await rp(
        `https://api.coingecko.com/api/v3/coins/${coingeckoId}/market_chart/range?vs_currency=USD&from=${timestampFrom}&to=${timestampTo}`,
      ),
    );

    if (testRep) {
      let difference = 0;
      let bestIndex = 0;
      let bestDifference = Infinity;
      let i;
      let cur;
      let priceTime;

      const { prices } = testRep;
      for (i = 0; i < prices.length; i += 1) {
        cur = prices[i];
        priceTime = Math.round(cur[0] / 1000);
        difference = Math.abs(timestampTo - priceTime);
        if (difference < bestDifference) {
          bestDifference = difference;
          bestIndex = i;
        }
      }
      const bestPrices = prices[bestIndex];
      const [, price] = bestPrices;
      bestPrice = price;
    } else {
      bestPrice = 1;
    }
    rate = bestPrice;
  } else {
    rate = 1;
  }

  return rate;
};

const getHourlyUSDRateCryptocompare = async (timestamp, tokenSymbol) => {
  const timestampMS = Math.round(timestamp / 1000);

  const resp = JSON.parse(
    await rp(
      `https://min-api.cryptocompare.com/data/histohour?fsym=${tokenSymbol}&tsym=USD&toTs=${timestampMS}&limit=1`,
    ),
  );

  const tsData = resp && resp.Data && resp.Data.find(d => d.time === timestampMS);

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
  return new Promise((resolve, reject) => {
    app
      .service('conversionRates')
      .create({ timestamp, rates, symbol })
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

let symbolToToken;
const getTokenBySymbol = (app, symbol) => {
  if (!symbolToToken) {
    symbolToToken = {};
    const tokens = app.get('tokenWhitelist');
    tokens.forEach(token => {
      symbolToToken[token.symbol] = token;
    });
  }

  return symbolToToken[symbol] || { symbol };
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
  const stableCoins = app.get('stableCoins') || [];

  const token = getTokenBySymbol(app, symbol);

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
      newRates = await _getRatesCoinGecko(
        requestedSymbol,
        timestamp,
        coingeckoId,
        unknownRates,
        stableCoins,
      );
    } else {
      newRates = await _getRatesCryptocompare(
        timestamp,
        unknownRates,
        requestedSymbol,
        stableCoins,
      );
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

const getHourlyUSDCryptoConversion = async (app, ts, tokenSymbol = 'ETH') => {
  if (ts > Date.now()) throw new Error('Can not fetch crypto rate for future ts');

  // set the date to the top of the hour
  const requestTs = new Date(ts).setUTCMinutes(0, 0, 0);

  // Return 1 for stable coins
  const stableCoins = app.get('stableCoins') || [];
  if (stableCoins.includes(tokenSymbol)) {
    return { timestamp: requestTs, rate: 1 };
  }
  const token = getTokenBySymbol(app, tokenSymbol);

  // Check if we already have this exchange rate for this timestamp, if not we save it
  const dbRates = await _getRatesDb(app, requestTs, tokenSymbol);
  const retrievedRates = new Set(Object.keys(dbRates.rates || {}));

  if (retrievedRates.has('USD')) {
    return { timestamp: dbRates.timestamp, rate: dbRates.rates.USD };
  }

  let rate = 0;
  if (tokenSymbol === 'PAN') {
    rate = await getHourlyUSDRateCoingecko(tokenSymbol, requestTs, token.coingeckoId);
  } else {
    rate = await getHourlyUSDRateCryptocompare(requestTs, tokenSymbol);
  }

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
