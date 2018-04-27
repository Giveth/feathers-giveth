const Web3 = require('web3');
const path = require('path');
const GanacheCLI = require('ganache-cli');
const { Kernel, ACL, LPVault, LiquidPledging, LPFactory, test } = require('giveth-liquidpledging');
const { LPPDac, LPPDacFactory } = require('lpp-dac');
const { LPPCampaign, LPPCampaignFactory } = require('lpp-campaign');
const { LPPCappedMilestone, LPPCappedMilestoneFactory } = require('lpp-capped-milestone');
const { MiniMeTokenFactory } = require('minimetoken');

const { StandardTokenTest } = test;

const web3 = new Web3('http://localhost:8545');

async function deploy() {
  const accounts = await web3.eth.getAccounts();
  const escapeHatch = accounts[0];
  const from = accounts[0];

  const baseVault = await LPVault.new(web3, escapeHatch);
  const baseLP = await LiquidPledging.new(web3, escapeHatch);
  const lpFactory = await LPFactory.new(web3, baseVault.$address, baseLP.$address);

  const r = await lpFactory.newLP(escapeHatch, from, { $extraGas: 100000 });

  const vaultAddress = r.events.DeployVault.returnValues.vault;
  const vault = new LPVault(web3, vaultAddress);

  const lpAddress = r.events.DeployLiquidPledging.returnValues.liquidPledging;
  const liquidPledging = new LiquidPledging(web3, lpAddress);

  // set permissions
  const kernel = new Kernel(web3, await liquidPledging.kernel());
  const acl = new ACL(web3, await kernel.acl());
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

  // deploy campaign plugin
  const tokenFactory = await MiniMeTokenFactory.new(web3);
  const lppCampaignFactory = await LPPCampaignFactory.new(
    web3,
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

  const campaignApp = await LPPCampaign.new(web3, escapeHatch);
  await kernel.setApp(
    await kernel.APP_BASES_NAMESPACE(),
    await lppCampaignFactory.CAMPAIGN_APP_ID(),
    campaignApp.$address,
    { $extraGas: 100000 },
  );

  // deploy dac plugin
  const lppDacFactory = await LPPDacFactory.new(
    web3,
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

  const dacApp = await LPPDac.new(web3, escapeHatch);
  await kernel.setApp(
    await kernel.APP_BASES_NAMESPACE(),
    await lppDacFactory.DAC_APP_ID(),
    dacApp.$address,
    { $extraGas: 100000 },
  );

  // deploy milestone plugin
  const lppCappedMilestoneFactory = await LPPCappedMilestoneFactory.new(
    web3,
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

  const milestoneApp = await LPPCappedMilestone.new(web3, escapeHatch);
  await kernel.setApp(
    await kernel.APP_BASES_NAMESPACE(),
    await lppCappedMilestoneFactory.MILESTONE_APP_ID(),
    milestoneApp.$address,
    { $extraGas: 100000 },
  );

  const token = await StandardTokenTest.new(web3);
  await token.mint(accounts[0], web3.utils.toWei('100'), { from });
  await token.mint(accounts[1], web3.utils.toWei('100'), { from });
  await token.mint(accounts[2], web3.utils.toWei('100'), { from });

  console.log(await liquidPledging.kernel());
  console.log(await liquidPledging.vault());
  console.log('\n\n', {
    token: token.$address,
    vault: vault.$address,
    liquidPledging: liquidPledging.$address,
    lppDacFactory: lppDacFactory.$address,
    lppCampaignFactory: lppCampaignFactory.$address,
    lppCappedMilestoneFactory: lppCappedMilestoneFactory.$address,
  });
  process.exit(); // some reason, this script won't exit. I think it has to do with web3 subscribing to tx confirmations?
}

if (web3.currentProvider.connected) deploy();
else {
  const ganache = GanacheCLI.server({
    ws: true,
    gasLimit: 6700000,
    total_accounts: 10,
    seed: 'TestRPC is awesome!',
    db_path: path.join(__dirname, '../data/ganache-cli'),
    logger: console,
  });

  ganache.listen(8545, '127.0.0.1', () => {
    deploy().catch(() => ganache.close());
  });
}
