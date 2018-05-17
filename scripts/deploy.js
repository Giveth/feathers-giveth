/* eslint-disable import/no-extraneous-dependencies */
const Web3 = require('web3');
const { Kernel, ACL, LPVault, LiquidPledging, LPFactory } = require('giveth-liquidpledging');
const { LPPDac, LPPDacFactory } = require('lpp-dac');
const { LPPCampaign, LPPCampaignFactory } = require('lpp-campaign');
const { LPPCappedMilestone, LPPCappedMilestoneFactory } = require('lpp-capped-milestone');
const { MiniMeTokenFactory } = require('minimetoken');
const { GivethBridge, ForeignGivethBridge } = require('giveth-bridge');
const startNetworks = require('./startNetworks');

async function deploy() {
  const { homeNetwork, foreignNetwork } = await startNetworks();

  await homeNetwork.waitForStart();
  await foreignNetwork.waitForStart();

  const homeWeb3 = new Web3('http://localhost:8545');
  const foreignWeb3 = new Web3('http://localhost:8546');

  const accounts = await foreignWeb3.eth.getAccounts();
  const escapeHatch = accounts[0];
  const from = accounts[0];

  const baseVault = await LPVault.new(foreignWeb3, escapeHatch);
  const baseLP = await LiquidPledging.new(foreignWeb3, escapeHatch);
  const lpFactory = await LPFactory.new(foreignWeb3, baseVault.$address, baseLP.$address);

  const r = await lpFactory.newLP(escapeHatch, from, { $extraGas: 100000 });

  const vaultAddress = r.events.DeployVault.returnValues.vault;
  const vault = new LPVault(foreignWeb3, vaultAddress);

  const lpAddress = r.events.DeployLiquidPledging.returnValues.liquidPledging;
  const liquidPledging = new LiquidPledging(foreignWeb3, lpAddress);

  // set permissions
  const kernel = new Kernel(foreignWeb3, await liquidPledging.kernel());
  const acl = new ACL(foreignWeb3, await kernel.acl());
  await acl.createPermission(
    accounts[0],
    vault.$address,
    await vault.CANCEL_PAYMENT_ROLE(),
    accounts[0],
    { $extraGas: 200000 },
  );
  await acl.createPermission(
    accounts[0],
    vault.$address,
    await vault.CONFIRM_PAYMENT_ROLE(),
    accounts[0],
    { $extraGas: 200000 },
  );
  await acl.createPermission(
    accounts[0],
    vault.$address,
    await vault.SET_AUTOPAY_ROLE(),
    accounts[0],
    { $extraGas: 200000 },
  );
  await vault.setAutopay(true, { from: accounts[0], $extraGas: 100000 });

  // deploy campaign plugin
  const tokenFactory = await MiniMeTokenFactory.new(foreignWeb3);
  const lppCampaignFactory = await LPPCampaignFactory.new(
    foreignWeb3,
    kernel.$address,
    tokenFactory.$address,
    escapeHatch,
    escapeHatch,
    { $extraGas: 100000 },
  );
  await acl.grantPermission(
    lppCampaignFactory.$address,
    acl.$address,
    await acl.CREATE_PERMISSIONS_ROLE(),
    {
      $extraGas: 100000,
    },
  );
  await acl.grantPermission(
    lppCampaignFactory.$address,
    liquidPledging.$address,
    await liquidPledging.PLUGIN_MANAGER_ROLE(),
    { $extraGas: 100000 },
  );

  const campaignApp = await LPPCampaign.new(foreignWeb3, escapeHatch);
  await kernel.setApp(
    await kernel.APP_BASES_NAMESPACE(),
    await lppCampaignFactory.CAMPAIGN_APP_ID(),
    campaignApp.$address,
    { $extraGas: 100000 },
  );

  // deploy dac plugin
  const lppDacFactory = await LPPDacFactory.new(
    foreignWeb3,
    kernel.$address,
    tokenFactory.$address,
    escapeHatch,
    escapeHatch,
    { $extraGas: 100000 },
  );
  await acl.grantPermission(
    lppDacFactory.$address,
    acl.$address,
    await acl.CREATE_PERMISSIONS_ROLE(),
    {
      $extraGas: 100000,
    },
  );
  await acl.grantPermission(
    lppDacFactory.$address,
    liquidPledging.$address,
    await liquidPledging.PLUGIN_MANAGER_ROLE(),
    { $extraGas: 100000 },
  );

  const dacApp = await LPPDac.new(foreignWeb3, escapeHatch);
  await kernel.setApp(
    await kernel.APP_BASES_NAMESPACE(),
    await lppDacFactory.DAC_APP_ID(),
    dacApp.$address,
    { $extraGas: 100000 },
  );

  // deploy milestone plugin
  const lppCappedMilestoneFactory = await LPPCappedMilestoneFactory.new(
    foreignWeb3,
    kernel.$address,
    escapeHatch,
    escapeHatch,
    { $extraGas: 100000 },
  );
  await acl.grantPermission(
    lppCappedMilestoneFactory.$address,
    acl.$address,
    await acl.CREATE_PERMISSIONS_ROLE(),
    {
      $extraGas: 100000,
    },
  );
  await acl.grantPermission(
    lppCappedMilestoneFactory.$address,
    liquidPledging.$address,
    await liquidPledging.PLUGIN_MANAGER_ROLE(),
    { $extraGas: 100000 },
  );

  const milestoneApp = await LPPCappedMilestone.new(foreignWeb3, escapeHatch);
  await kernel.setApp(
    await kernel.APP_BASES_NAMESPACE(),
    await lppCappedMilestoneFactory.MILESTONE_APP_ID(),
    milestoneApp.$address,
    { $extraGas: 100000 },
  );

  // deploy bridges
  const foreignBridge = await ForeignGivethBridge.new(
    foreignWeb3,
    accounts[0],
    accounts[0],
    tokenFactory.$address,
    liquidPledging.$address,
    { from: accounts[0], $extraGas: 100000 },
  );

  const fiveDays = 60 * 60 * 24 * 5;
  const homeBridge = await GivethBridge.new(
    homeWeb3,
    accounts[0],
    accounts[0],
    accounts[0],
    fiveDays,
    { from: accounts[0], $extraGas: 100000 },
  );

  await homeBridge.authorizeSpender(accounts[0], true, { from: accounts[0] });

  // deploy tokens
  await foreignBridge.addToken(0, 'Foreign ETH', 18, 'FETH', { from: accounts[0] });
  const foreignEthAddress = await foreignBridge.tokenMapping(0);

  console.log('\n\n', {
    vault: vault.$address,
    liquidPledging: liquidPledging.$address,
    lppDacFactory: lppDacFactory.$address,
    lppCampaignFactory: lppCampaignFactory.$address,
    lppCappedMilestoneFactory: lppCappedMilestoneFactory.$address,
    givethBridge: homeBridge.$address,
    foreignGivethBridge: foreignBridge.$address,
    homeEthToken: foreignEthAddress,
  });
  process.exit(); // some reason, this script won't exit. I think it has to do with web3 subscribing to tx confirmations?
}

deploy();
