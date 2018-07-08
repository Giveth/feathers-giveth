const logger = require('winston');
const fundAccountIfLow = require('./lib/fundAccountIfLow');
const { batchAndExecuteRequests, addAccountToWallet } = require('./lib/web3Helpers');

/**
 * Factory function to create an object that will monitor the balance for
 * existing users and topup their accounts if their balance is low
 *
 * @param {object} app feathers app instance
 */
function balanceMonitor(app) {
  const web3 = app.getWeb3();

  const {
    ethFunderInterval: pollTime,
    ethFunderPK,
    walletFundingTimeout: fundingTimeout,
    walletFundingBlacklist: blacklist,
  } = app.get('blockchain');

  const hasAccount = !!addAccountToWallet(web3, ethFunderPK);

  async function fundAccountsWithLowBalance() {
    // fetch all users that are not blacklisted and were lastFunded before the fundingTimeout
    const query = {
      address: {
        $nin: blacklist,
      },
      $or: [
        { lastFunded: { $exists: false } },
        { lastFunded: { $lte: new Date().getTime() - fundingTimeout } },
      ],
    };

    const usersToCheck = await app.service('users').find({ paginate: false, query });

    if (usersToCheck.length === 0) return;

    const handleBalanceResponse = address => (err, balance) => {
      if (err) logger.error('Error fetching balance for address: ', address, err);
      fundAccountIfLow(app, address, balance);
    };

    // generate a request to execute to fetch each users balance
    const balRequests = usersToCheck.map(({ address }) =>
      web3.eth.getBalance.request(address, 'pending', handleBalanceResponse(address)),
    );

    batchAndExecuteRequests(web3, balRequests);
  }

  return {
    start() {
      if (!hasAccount) {
        logger.warn('Not starting BalanceMonitor as ethFunderPK is missing from the config');
        return;
      }

      setInterval(fundAccountsWithLowBalance, pollTime);
      fundAccountsWithLowBalance();
    },
  };
}

module.exports = balanceMonitor;
