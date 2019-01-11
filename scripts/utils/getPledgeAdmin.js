const Web3 = require('web3');
const { LiquidPledging } = require('giveth-liquidpledging');

const foreignWeb3 = new Web3('https://rinkeby.giveth.io');

/**
  Utility method to get a single pledge from liquidPledging

  Usage: node getPledge [pledgeId]
* */

async function getPledgeAdmin(adminId) {
  const liquidPledging = new LiquidPledging(
    foreignWeb3,
    '0x8eB047585ABeD935a73ba4b9525213F126A0c979',
  );

  const admin = await liquidPledging.getPledgeAdmin(adminId);
  console.log('admin', admin);
}

getPledgeAdmin(process.argv[2]);
