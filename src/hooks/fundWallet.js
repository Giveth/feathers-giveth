import logger from 'winston';
import { checkContext } from 'feathers-hooks-common';

import { lockNonceAndSendTransaction } from '../blockchain/helpers';

export default () => context => {
  checkContext(context, 'after', ['create']);

  const web3 = context.app.get('web3');
  const {
    walletMinBalance,
    walletSeedAmount,
    ethFunderPK,
    walletFundingBlacklist = [],
  } = context.app.get('blockchain');

  if (web3.eth.accounts.wallet.length === 0 && ethFunderPK) {
    const account = web3.eth.accounts.privateKeyToAccount(ethFunderPK);
    web3.eth.accounts.wallet.add(account);
  }

  if (walletFundingBlacklist.includes(context.data.address)) return context;

  return web3.eth
    .getBalance(context.data.address)
    .then(bal => {
      const { toBN } = web3.utils;

      if (toBN(bal).lt(toBN(walletMinBalance))) {
        lockNonceAndSendTransaction(web3, web3.eth.sendTransaction, {
          from: web3.eth.accounts.wallet[0].address,
          to: context.data.address,
          value: walletSeedAmount,
          gas: 21000,
        }).on('transactionHash', txHash => {
          context.app.service('users').patch(context.data.address, {
            lastFunded: new Date(),
            fundingTxHash: txHash,
          });
        });
      }

      return context;
    })
    .catch(e => {
      logger.error('Failed to fund wallet:', context.data.address, e);
      return context;
    });
};
