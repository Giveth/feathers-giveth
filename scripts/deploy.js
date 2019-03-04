/* eslint-disable import/no-extraneous-dependencies */
const Web3 = require('web3');
const { Kernel, ACL, LPVault, LiquidPledging, LPFactory, test } = require('giveth-liquidpledging');
const { LPPCampaign, LPPCampaignFactory } = require('lpp-campaign');
const { BridgedMilestone, LPMilestone, MilestoneFactory } = require('lpp-milestones');
const { MiniMeTokenFactory, MiniMeToken, MiniMeTokenState } = require('minimetoken');
const { GivethBridge, ForeignGivethBridge } = require('giveth-bridge');
const startNetworks = require('./startNetworks');

const { RecoveryVault } = test;

// NOTE: do not use the bridge account (account[10]) for any txs outside of the bridge
// if you do, the nonce will become off and the bridge will fail

async function deploy() {
  try {
    const { homeNetwork, foreignNetwork } = await startNetworks();

    await homeNetwork.waitForStart();
    await foreignNetwork.waitForStart();

    const homeWeb3 = new Web3('http://localhost:8545');
    const foreignWeb3 = new Web3('http://localhost:8546');

    const accounts = await foreignWeb3.eth.getAccounts();
    const homeAccounts = await homeWeb3.eth.getAccounts();

    const from = accounts[0];

    const baseVault = await LPVault.new(foreignWeb3);
    const baseLP = await LiquidPledging.new(foreignWeb3);
    const lpFactory = await LPFactory.new(foreignWeb3, baseVault.$address, baseLP.$address, {
      gas: 6700000,
    });
    const recoveryVault = (await RecoveryVault.new(foreignWeb3)).$address;
    const r = await lpFactory.newLP(from, recoveryVault, { $extraGas: 100000 });

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
    const lppCampaignFactory = await LPPCampaignFactory.new(foreignWeb3, kernel.$address, {
      $extraGas: 100000,
    });
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

    const campaignApp = await LPPCampaign.new(foreignWeb3);
    await kernel.setApp(
      await kernel.APP_BASES_NAMESPACE(),
      await lppCampaignFactory.CAMPAIGN_APP_ID(),
      campaignApp.$address,
      { $extraGas: 100000 },
    );

    // deploy MilestoneFactory

    const milestoneFactory = await MilestoneFactory.new(foreignWeb3, kernel.$address, {
      $extraGas: 100000,
    });
    await acl.grantPermission(
      milestoneFactory.$address,
      acl.$address,
      await acl.CREATE_PERMISSIONS_ROLE(),
      {
        $extraGas: 100000,
      },
    );
    await acl.grantPermission(
      milestoneFactory.$address,
      kernel.$address,
      await kernel.APP_MANAGER_ROLE(),
      { $extraGas: 100000 },
    );
    await acl.grantPermission(
      milestoneFactory.$address,
      liquidPledging.$address,
      await liquidPledging.PLUGIN_MANAGER_ROLE(),
      { $extraGas: 100000 },
    );

    // deploy LPMilestone plugin

    const lpMilestoneApp = await LPMilestone.new(foreignWeb3);
    await kernel.setApp(
      await kernel.APP_BASES_NAMESPACE(),
      await milestoneFactory.LP_MILESTONE_APP_ID(),
      lpMilestoneApp.$address,
      { $extraGas: 100000 },
    );

    // deploy BridgedMilestone plugin

    const bridgedMilestoneApp = await BridgedMilestone.new(foreignWeb3);
    await kernel.setApp(
      await kernel.APP_BASES_NAMESPACE(),
      await milestoneFactory.BRIDGED_MILESTONE_APP_ID(),
      bridgedMilestoneApp.$address,
      { $extraGas: 100000 },
    );

    // deploy bridges
    const foreignBridge = await ForeignGivethBridge.new(
      foreignWeb3,
      accounts[10],
      accounts[10],
      tokenFactory.$address,
      liquidPledging.$address,
      accounts[10],
      [],
      [],
      { from: accounts[10], $extraGas: 100000 },
    );

    await kernel.setApp(
      await kernel.APP_ADDR_NAMESPACE(),
      foreignWeb3.utils.keccak256('ForeignGivethBridge'),
      foreignBridge.$address,
      { $extraGas: 100000 },
    );

    const fiveDays = 60 * 60 * 24 * 5;
    const homeBridge = await GivethBridge.new(
      homeWeb3,
      accounts[10],
      accounts[10],
      60 * 60 * 25,
      60 * 60 * 48,
      accounts[10],
      fiveDays,
      { from: accounts[10], $extraGas: 100000 },
    );

    await homeBridge.authorizeSpender(accounts[10], true, { from: accounts[10] });

    // deploy tokens
    await foreignBridge.addToken(
      '0x0000000000000000000000000000000000000000',
      'Foreign ETH',
      18,
      'FETH',
      { from: accounts[10] },
    );
    const foreignEthAddress = await foreignBridge.tokenMapping(
      '0x0000000000000000000000000000000000000000',
    );

    // deploy ERC20 test token
    const miniMeToken = await MiniMeToken.new(
      homeWeb3,
      tokenFactory.$address,
      '0x0000000000000000000000000000000000000000',
      '0x0000000000000000000000000000000000000000',
      'MiniMe Test Token',
      18,
      'MMT',
      true,
    );

    // generate tokens for all home accounts
    // we first generate all tokens, then transfer, otherwise MetaMask will not show token balances
    await miniMeToken.generateTokens(homeAccounts[10], Web3.utils.toWei('100000'));

    // transfer tokens to all other home accounts, so that Meta mask will detect these tokens
    await Promise.all(
      homeAccounts.map(
        async a =>
          await miniMeToken.transfer(a, Web3.utils.toWei('10000'), { from: homeAccounts[10] }),
      ),
    );

    const miniMeTokenState = new MiniMeTokenState(miniMeToken);
    const st = await miniMeTokenState.getState();
    homeAccounts.map(a =>
      console.log('MMT balance of address ', a, ' > ', Web3.utils.fromWei(st.balances[a])),
    );

    // whitelist MMT token
    await homeBridge.whitelistToken(miniMeToken.$address, true, { from: accounts[10] });

    // add token on foreign
    await foreignBridge.addToken(miniMeToken.$address, 'MiniMe Test Token', 18, 'MMT', {
      from: accounts[10],
    });
    const foreigTokenAddress = await foreignBridge.tokenMapping(miniMeToken.$address);

    console.log('\n\n', {
      vault: vault.$address,
      liquidPledging: liquidPledging.$address,
      lppCampaignFactory: lppCampaignFactory.$address,
      milestoneFactory: milestoneFactory.$address,
      givethBridge: homeBridge.$address,
      foreignGivethBridge: foreignBridge.$address,
      homeEthToken: foreignEthAddress,
      miniMeToken: {
        name: 'MiniMe Token',
        address: miniMeToken.$address,
        foreignAddress: foreigTokenAddress,
        symbol: 'MMT',
        decimals: 18,
      },
    });
    process.exit(); // some reason, this script won't exit. I think it has to do with web3 subscribing to tx confirmations?
  } catch (e) {
    console.log(e);
    process.exit();
  }
}

deploy();
