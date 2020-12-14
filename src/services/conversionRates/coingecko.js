const rp = require('request-promise');
const logger = require('winston');

const fetchCoingecko = async (timestampMS, coingeckoId, toSymbol) => {
  const timestampTo = Math.round(timestampMS / 1000);
  const timestampFrom = timestampTo - 3600 * 12;
  let bestPrice = 1;
  let resp;
  try {
    resp = JSON.parse(
      await rp(
        `https://api.coingecko.com/api/v3/coins/${coingeckoId}/market_chart/range?vs_currency=${toSymbol}&from=${timestampFrom}&to=${timestampTo}`,
      ),
    );
  } catch (e) {
    logger.error(`coingecko fetch (id:${coingeckoId}, toSymbol:${toSymbol})`);
    logger.error(e);
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
