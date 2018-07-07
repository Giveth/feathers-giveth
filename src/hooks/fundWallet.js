import logger from 'winston';
import { checkContext } from 'feathers-hooks-common';

import { lockNonceAndSendTransaction } from '../blockchain/helpers';

const { getWeb3 } = require('../blockchain/web3Helpers');

function fundWallet() {
  const app = this;
  const web3 = getWeb3();
  const { toBN } = web3.utils;

  const { walletMinBalance, walletSeedAmount, ethFunderPK, walletFundingBlacklist = [] } = app.get(
    'blockchain',
  );

  if (web3.eth.accounts.wallet.length === 0 && ethFunderPK) {
    const account = web3.eth.accounts.privateKeyToAccount(ethFunderPK);
    web3.eth.accounts.wallet.add(account);
  }

  return async context => {
    checkContext(context, 'after', ['create']);

    const { address } = context.data;

    if (walletFundingBlacklist.includes(address)) return context;

    try {
      const bal = await web3.eth.getBalance(address);

      // fund wallet if the bal is < minBal
      if (toBN(bal).lt(toBN(walletMinBalance))) {
        lockNonceAndSendTransaction(web3, web3.eth.sendTransaction, {
          from: web3.eth.accounts.wallet[0].address,
          to: address,
          value: walletSeedAmount,
          gas: 21000,
        }).on('transactionHash', txHash => {
          context.app.service('users').patch(address, {
            lastFunded: new Date(),
            fundingTxHash: txHash,
          });
        });
      }
    } catch (e) {
      logger.error('Failed to fund wallet:', address, e);
    }
    return context;
  };
}

module.exports = fundWallet;
