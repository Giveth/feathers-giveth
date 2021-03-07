const rp = require('request-promise');
const logger = require('winston');

const fetchCoingecko = async (timestampMS, coingeckoId, toSymbol) => {
  const timestampTo = Math.round(timestampMS / 1000);
  /**
   * based on documentation, Hourly data will be used for duration between 1 day and 90 day
   * @see{@link https://www.coingecko.com/api/documentations/v3#/coins/get_coins__id__market_chart_range}
   */

  // for values below 72 hours sometime coingecko return empty values so I had to increate the range
  const timestampFrom = timestampTo - 3600 * 72;
  let bestPrice = 1;
  let resp;
  try {
    resp = JSON.parse(
      await rp(
        `https://api.coingecko.com/api/v3/coins/${coingeckoId}/market_chart/range?vs_currency=${toSymbol}&from=${timestampFrom}&to=${timestampTo}`,
      ),
    );
  } catch (e) {
    logger.error(`coingecko fetch (id:${coingeckoId}, toSymbol:${toSymbol})`, e);
    return undefined;
  }

  if (resp && resp.prices) {
    let difference;
    let bestDifference = Infinity;

    resp.prices.forEach(cur => {
      const [time, price] = cur;
      difference = Math.abs(timestampMS - time);
      if (difference < bestDifference) {
        bestDifference = difference;
        bestPrice = price;
      }
    });
  } else {
    bestPrice = 1;
  }
  return bestPrice;
};

module.exports = {
  fetchCoingecko,
};
