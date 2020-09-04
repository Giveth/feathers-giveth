const { LiquidPledging } = require('giveth-liquidpledging');

const configFileName = 'test'; // default or beta

// eslint-disable-next-line import/no-dynamic-require
const config = require(`../../config/${configFileName}.json`);

const { liquidPledgingAddress } = config.blockchain;

const { getWeb3 } = require('../../src/blockchain/lib/web3Helpers');

const foreignWeb3 = getWeb3({
  get: key => config[key],
});

/**
  Utility method to get a single pledge from liquidPledging

  Usage: node getPledge [pledgeId]
* */

async function getPledgeAdmin(adminId) {
  const liquidPledging = new LiquidPledging(foreignWeb3, liquidPledgingAddress);
  const block = await foreignWeb3.eth.getBlock('3050500');

  console.log(block.timestamp);

  const admin = await liquidPledging.getPledgeAdmin(adminId);
  console.log('admin', admin);
}
setTimeout(() => {
  getPledgeAdmin(process.argv[2]);
}, 0);
