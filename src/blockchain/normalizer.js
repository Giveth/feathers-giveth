const { LiquidPledging } = require('giveth-liquidpledging');
const logger = require('winston');
const { addAccountToWallet } = require('./lib/web3Helpers');
const lockNonceAndSendTransaction = require('./lib/lockNonceAndSendTransaction');
const { DonationStatus } = require('../models/donations.model');

function normalizer(app) {
  const service = app.service('donations');
  const web3 = app.getWeb3();
  let interval;

  const { ethFunderPK } = app.get('blockchain');
  const hasAccount = !!addAccountToWallet(web3, ethFunderPK);

  const { liquidPledgingAddress } = app.get('blockchain');

  if (!liquidPledgingAddress) {
    throw new Error('liquidPledgingAddress is not defined in the configuration file');
  }

  const liquidPledging = new LiquidPledging(web3, liquidPledgingAddress);

  /**
   * @returns {array} fetches a list of pledgeIds that need to be normalized. Normalizing needs to
   *                  occur if the pledge has an intendedProject, and the commitTime has passed
   */
  async function getPledgesToNormalize() {
    const pledges = (await service.find({
      paginate: false,
      query: {
        status: DonationStatus.TO_APPROVE,
        intendedProjectId: { $gt: 0 },
        amountRemaining: { $ne: '0' },
        commitTime: {
          $lte: new Date(),
        },
      },
    })).reduce((accumulator, d) => d.mined && accumulator.add(d.pledgeId), new Set());

    return Array.from(pledges);
  }

  /**
   * attempts to broadcast a tx. Will successfully resolve as soon as a txHash is
   * returned. Does not wait for the tx to be mined to resolve. Otherwise will fail.
   *
   * @param {function} method the fn to pass to lockNonceAndSendTransaction
   * @param {object} opts the opts to pass to lockNonceAndSendTransaction
   * @param {*} arg  the fn argument to pass to lockNonceAndSendTransaction
   */
  function sendTx(method, opts, arg) {
    return new Promise((resolve, reject) => {
      lockNonceAndSendTransaction(web3, method, opts, arg)
        .on('transactionHash', () => {
          // if we have a txHash, then the tx was submitted and successfully estimatedGas
          // if it fails at this point, we will retry in the next poll
          resolve();
        })
        .catch(reject);
    });
  }

  /**
   * Normalize the provided pledges in chunks of `batchSize`. If a particular batch fails, we will try again
   * reducing the batch sized in half, until we are only normalizing a single pledge. If a single pledge fails
   * to normalize, we will log the pledgeId and manual action will need to be taken.
   *
   * If a pledge fails to normalized 2x then the feathers cache is out of sync with what the blockchain knows
   * and there is most likely a bug elsewhere in the codebase.
   *
   * Note: we consider normalization a success as soon as we receive a txHash. This means there is a possibility
   * that the normalization can still fail, but the tx was valid when we sent it. These pledges will be re-normalized
   * the next time this is run.
   *
   * @param {Array} pledges the ids of the pledges to normalize
   * @param {int} batchSize (optional) the size of the batch to chunk the requests into. Defaults to 20.
   */
  async function execute(pledges, batchSize = 20) {
    if (pledges.length === 0) return;
    const batch = pledges.splice(0, batchSize);
    const method = batchSize > 1 ? liquidPledging.mNormalizePledge : liquidPledging.normalizePledge;
    const arg = batchSize > 1 ? batch : batch[0];
    const opts = {
      from: web3.eth.accounts.wallet[0].address,
      $extraGas: 100000,
    };

    try {
      await sendTx(method, opts, arg);
    } catch (e) {
      if (batchSize === 1 || batch.length === 1) {
        logger.error('Failed to normalize pledgeID ->', batch[0]);
        return;
      }

      // keep trying with smaller batches
      await execute(batch, Math.floor(batchSize / 2));
    }

    await execute(pledges, batchSize);
  }

  async function normalizePledges() {
    try {
      const pledges = await getPledgesToNormalize();
      await execute(pledges);
    } catch (e) {
      logger.error('Error attempting to normalize pledges ->', e);
    }
  }

  return {
    /**
     * Look for any pledges that need to be normalized and normalize them every 5 mins.
     */
    start() {
      const pollTime = 1000 * 60 * 5; // check every 5 min
      if (!hasAccount) {
        logger.warn('Not starting BalanceMonitor as ethFunderPK is missing from the config');
        return;
      }

      if (interval) return;

      interval = setInterval(normalizePledges, pollTime);
      normalizePledges();
    },
  };
}

module.exports = normalizer;
