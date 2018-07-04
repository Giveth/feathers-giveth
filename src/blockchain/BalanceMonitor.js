const logger = require('winston');
const { lockNonceAndSendTransaction } = require('./helpers');

// recursively execute all requests in batches of 100
function batchAndExecuteRequests(web3, requests) {
  const batch = new web3.BatchRequest();
  requests.splice(0, 100).forEach(r => batch.add(r));
  batch.execute();

  batchAndExecuteRequests(web3, requests);
}

module.exports = class {
  constructor(app, web3) {
    this.app = app;
    this.web3 = web3;

    const blockchain = app.get('blockchain');
    this.minBal = blockchain.walletMinBalance;
    this.seedAmount = blockchain.walletSeedAmount;
    this.pollTime = blockchain.ethFunderInterval;
    this.fundingTimeout = blockchain.walletFundingTimeout;
    this.blacklist = blockchain.walletFundingBlacklist;

    this.isRunning = false;

    const { ethFunderPK } = blockchain;
    if (ethFunderPK) {
      this.account = web3.eth.accounts.privateKeyToAccount(ethFunderPK);
      web3.eth.accounts.wallet.add(this.account);
    }
  }

  start() {
    if (!this.account) {
      logger.warn('Not starting BalanceMonitor as no ethFunderPK was provided');
      return;
    }

    const poll = () => {
      this.fundAccountsWithLowBalance();
      setTimeout(poll, this.pollTime);
    };

    poll();
  }

  async fundAccountsWithLowBalance() {
    // fetch all users that are not blacklisted and were lastFunded before the fundingTimeout
    const query = {
      address: {
        $nin: this.blacklist,
      },
      $or: [
        { lastFunded: { $exists: false } },
        { lastFunded: { $lte: new Date().getTime() - this.fundingTimeout } },
      ],
    };

    const usersToCheck = await this.app.service('users').find({ paginate: false, query });

    if (usersToCheck.length === 0) return;

    const handleBalanceResponse = user => (err, balance) => {
      if (err) logger.error('Error fetching balance for address: ', user.address, err);
      this.fundAccountIfLow(user, balance);
    };

    // generate a request to execute to fetch each users balance
    const balRequests = usersToCheck.map(user =>
      this.web3.getBalance.request(user.address, 'pending', handleBalanceResponse(user)),
    );

    batchAndExecuteRequests(this.web3, balRequests);
  }

  fundAccountIfLow(user, currentBal) {
    const { toBN } = this.web3.utils;

    if (toBN(currentBal).lt(toBN(this.minBal))) {
      lockNonceAndSendTransaction(this.web3, this.web3.eth.sendTransaction, {
        from: this.account.address,
        to: user.address,
        value: this.seedAmount,
        gas: 21000,
      });

      this.app.service('users').patch(user.address, {
        lastFunded: new Date(),
      });
    }
  }
};
