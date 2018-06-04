import logger from 'winston';
import { lockNonceAndSendTransaction } from './helpers';

export default class {
  constructor(app, web3) {
    this.app = app;
    this.web3 = web3;

    const blockchain = app.get('blockchain');
    this.minBal = blockchain.walletMinBalance;
    this.seedAmount = blockchain.walletSeedAmount;
    this.pollTime = blockchain.ethFunderInterval;
    this.fundingTimeout = blockchain.walletFundingTimeout;

    this.queue = [];
    this.isRunning = false;

    const { ethFunderPK } = blockchain;
    if (ethFunderPK) {
      this.account = web3.eth.accounts.privateKeyToAccount(ethFunderPK);
      web3.eth.accounts.wallet.add(this.account);
    }
  }

  start() {
    if (!this.account) logger.warn('Not starting BalanceMonitor as no ethFunderPK was provided');

    const poll = () => {
      this.checkBalances();
      setTimeout(poll, this.pollTime);
    };

    poll();
  }

  checkBalances() {
    return this.app
      .service('users')
      .find({
        paginate: false,
        query: {
          $or: [
            { lastFunded: { $exists: false } },
            { lastFunded: { $lte: new Date().getTime() - this.fundingTimeout } },
          ],
        },
      })
      .then(users => {
        let i = 0;
        let batch = new this.web3.BatchRequest();

        users.forEach(u => {
          batch.add(
            this.web3.eth.getBalance.request(u.address, 'pending', (err, bal) => {
              if (err) logger.error('Error fetching balance for address: ', u.address, err);
              this.sendEthIfNecessary(u, bal);
            }),
          );

          i += 1;
          if (i % 100 === 0) {
            batch.execute();
            batch = new this.web3.BatchRequest();
          }
        });

        batch.execute();
      });
  }

  sendEthIfNecessary(user, currentBal) {
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
}
