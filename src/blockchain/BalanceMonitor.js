const logger = require('winston');
const { fundAccountIfLow } = require('./helpers');
const { getWeb3, batchAndExecuteRequests } = require('./web3Helpers');

function balanceMonitor() {
  const app = this;
  const web3 = getWeb3();

  const {
    ethFunderInterval: pollTime,
    ethFunderPK,
    walletFundingTimeout: fundingTimeout,
    walletFundingBlacklist: blacklist,
  } = app.get('blockchain');

  const account = ethFunderPK ? web3.eth.accounts.privateKeyToAccount(ethFunderPK) : undefined;
  if (web3.eth.accounts.wallet.length === 0 && ethFunderPK) {
    web3.eth.accounts.wallet.add(account);
  }

  const fundAccountsWithLowBalance = async () => {
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

    const handleBalanceResponse = user => (err, balance) => {
      if (err) logger.error('Error fetching balance for address: ', user.address, err);
      fundAccountIfLow(user.address, balance);
    };

    // generate a request to execute to fetch each users balance
    const balRequests = usersToCheck.map(user =>
      web3.eth.getBalance.request(user.address, 'pending', handleBalanceResponse(user)),
    );

    batchAndExecuteRequests(web3, balRequests);
  };

  return {
    start() {
      if (!account) {
        logger.warn('Not starting BalanceMonitor as ethFunderPK is missing from the config');
        return;
      }

      setTimeout(fundAccountsWithLowBalance, pollTime);
      fundAccountsWithLowBalance();
    },
  };
}

module.exports = balanceMonitor;
