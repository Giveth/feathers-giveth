/**
 * to run:
 *
 * NODE_ENV=production node scripts/recalculateDonationUSDValues.js
 *
 */

// disable blockchain watchers
process.env.START_WATCHERS = false;

const app = require('../src/app');

async function run() {
  console.log('recalculating donation USD values');

  const donations = await app.service('donations').find({ paginate: false });

  const unsetUsdValue = donations.filter(d => !d.usdValue);
  const setUsdValue = donations.filter(d => d.usdValue);

  const recalcPromises = setUsdValue.map(d =>
    // USD value is set via a hook on patch & create requests
    app.service('donations').patch(d._id, {}, { skipEntityCounterUpdate: true }),
  );

  const unsetPromises = [];

  while (unsetUsdValue.length > 0) {
    // we need to fetch the rate for these, so respect the rate limit

    unsetPromises.push(
      ...unsetUsdValue
        .splice(0, 10)
        // USD value is set via a hook on patch & create requests
        .map(d => app.service('donations').patch(d._id, {}, { skipEntityCounterUpdate: true })),
    );

    if (unsetUsdValue.length > 0) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  await Promise.all([...recalcPromises, ...unsetPromises]);

  console.log('successfully recalculated all donation USD values');
}

run()
  .then(() => process.exit())
  .catch(e => console.error('ERROR OCCURRED: ', e));
