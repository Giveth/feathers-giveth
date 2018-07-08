import logger from 'winston';
import { checkContext } from 'feathers-hooks-common';

import { fundAccountIfLow } from '../blockchain/helpers';

const { getWeb3, addAccountToWallet } = require('../blockchain/web3Helpers');

const fundWallet = () => async context => {
  checkContext(context, 'after', ['create']);
  const { app } = context;
  const web3 = getWeb3(app);

  const { ethFunderPK, walletFundingBlacklist = [] } = app.get('blockchain');

  addAccountToWallet(web3, ethFunderPK);

  const { address } = context.data;

  if (walletFundingBlacklist.includes(address)) return context;

  try {
    const bal = await web3.eth.getBalance(address);

    fundAccountIfLow(app, address, bal);
  } catch (e) {
    logger.error('Failed to fund wallet:', address, e);
  }
  return context;
};

module.exports = fundWallet;
