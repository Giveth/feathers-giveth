const Web3 = require('web3');
const { LiquidPledging, LPVault } = require('giveth-liquidpledging');
const { LPPDacs, LPPDacsRuntimeByteCode } = require('lpp-dacs');
const { LPPCampaignFactory, LPPCampaignRuntimeByteCode } = require('lpp-campaign');
const { LPPCappedMilestones, LPPCappedMilestonesRuntimeByteCode} = require('lpp-capped-milestone');

const web3 = new Web3('ws://localhost:8546');

async function deploy() {
  const accounts = await web3.eth.getAccounts();
  const escapeHatch = accounts[0];
  const vault = await LPVault.new(web3, escapeHatch, escapeHatch);
  const liquidPledging = await LiquidPledging.new(web3, vault.$address, escapeHatch, escapeHatch);
  await vault.setLiquidPledging(liquidPledging.$address);

  const dacs = await LPPDacs.new(web3, liquidPledging.$address, escapeHatch, escapeHatch, {gas: 6500000});
  const campaignFactory = await LPPCampaignFactory.new(web3, escapeHatch, escapeHatch, {gas: 6500000});
  const cappedMilestones = await LPPCappedMilestones.new(web3, liquidPledging.$address, escapeHatch, escapeHatch);

  await liquidPledging.addValidPlugin(web3.utils.keccak256(LPPDacsRuntimeByteCode));
  await liquidPledging.addValidPlugin(web3.utils.keccak256(LPPCampaignRuntimeByteCode));
  await liquidPledging.addValidPlugin(web3.utils.keccak256(LPPCappedMilestonesRuntimeByteCode));

  console.log('vault Address: ', vault.$address);
  console.log('liquidPledging Address: ', liquidPledging.$address);
  console.log('LPPDacs Address: ', dacs.$address);
  console.log('LPPCampaignFactory Address: ', campaignFactory.$address);
  console.log('LPPCappedMilestones Address: ', cappedMilestones.$address);
  process.exit(); // some reason, this script won't exit. I think it has to do with web3 subscribing to tx confirmations?
}

deploy();
