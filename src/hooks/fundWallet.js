import logger from 'winston';
import { checkContext } from 'feathers-hooks-common';

import { fundAccountIfLow } from '../blockchain/helpers';

const { getWeb3 } = require('../blockchain/web3Helpers');

function fundWallet() {
  const app = this;
  const web3 = getWeb3();

  const { ethFunderPK, walletFundingBlacklist = [] } = app.get('blockchain');

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

      fundAccountIfLow.call(app, address, bal);
    } catch (e) {
      logger.error('Failed to fund wallet:', address, e);
    }
    return context;
  };
}

module.exports = fundWallet;
