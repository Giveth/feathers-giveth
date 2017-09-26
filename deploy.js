const Web3 = require('web3');
const liquidpledging = require('liquidpledging');

const LiquidPledging = liquidpledging.LiquidPledging(false);
const Vault = liquidpledging.Vault;

const web3 = new Web3("ws://localhost:8546");

async function deploy() {
  const vault = await Vault.new(web3);
  const liquidPledging = await LiquidPledging.new(web3, vault.$address);
  await vault.setLiquidPledging(liquidPledging.$address);

  console.log('vaultAddress: ', vault.$address);
  console.log('liquidPledgingAddress: ', liquidPledging.$address);
}

deploy();
