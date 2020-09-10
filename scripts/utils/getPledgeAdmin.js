const { LiquidPledging } = require('giveth-liquidpledging');

const configFileName = 'default'; // default or beta

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

  const admin = await liquidPledging.getPledgeAdmin(adminId);
  console.log('admin', admin);
}

getPledgeAdmin(process.argv[2]);
