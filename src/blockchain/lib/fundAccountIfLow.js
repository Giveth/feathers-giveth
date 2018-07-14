const lockNonceAndSendTransaction = require('./lockNonceAndSendTransaction');
const { toBN } = require('web3-utils');

/**
 * Send funds to an account if the currentBal is <
 * the configured `walletMinBalane`
 *
 * @param {object} app feathers app instance
 * @param {string} address address to fund
 * @param {string} currentBal current balance of the address
 */
module.exports = function fundAccountIfLow(app, address, currentBal) {
  const web3 = app.getWeb3();

  const { walletMinBalance, walletSeedAmount } = app.get('blockchain');

  // fund wallet if the bal is < minBal
  if (toBN(currentBal).lt(toBN(walletMinBalance))) {
    lockNonceAndSendTransaction(web3, web3.eth.sendTransaction, {
      from: web3.eth.accounts.wallet[0].address,
      to: address,
      value: walletSeedAmount,
      gas: 21000,
    }).on('transactionHash', txHash => {
      app.service('users').patch(address, {
        lastFunded: new Date(),
        fundingTxHash: txHash,
      });
    });
  }
};
