const { LiquidPledging } = require('giveth-liquidpledging');

const configFileName = 'default'; // default or beta

// eslint-disable-next-line import/no-dynamic-require
const config = require(`../../config/${configFileName}.json`);

const { liquidPledgingAddress } = config.blockchain;
const { getWeb3 } = require('../../src/blockchain/lib/web3Helpers');

const getForeignWeb3 = () => {
  return getWeb3({
    get: key => config[key],
  });
};

const foreignWeb3 = getForeignWeb3();

/**
  Utility method to get a single pledge from liquidPledging

  Usage: node getPledge [pledgeId]
* */

async function getPledge(pledgeId) {
  const liquidPledging = new LiquidPledging(foreignWeb3, liquidPledgingAddress);

  const pledge = await liquidPledging.getPledge(pledgeId);
  console.log('pledge', pledge);
}

getPledge(process.argv[2]);
