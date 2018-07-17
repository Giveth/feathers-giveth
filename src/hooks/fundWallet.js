const logger = require('winston');
const { checkContext } = require('feathers-hooks-common');
const fundAccountIfLow = require('../blockchain/lib/fundAccountIfLow');
const { addAccountToWallet } = require('../blockchain/lib/web3Helpers');

const fundWallet = () => async context => {
  checkContext(context, 'after', ['create']);
  const { app } = context;
  const web3 = app.getWeb3();

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
