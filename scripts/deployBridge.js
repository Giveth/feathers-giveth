/* eslint-disable import/no-extraneous-dependencies */
const Web3 = require('web3');
const { LiquidPledging, LPVault, LPFactory, Kernel, ACL } = require('giveth-liquidpledging');
const { MiniMeTokenFactory } = require('minimetoken');
const { GivethBridge, ForeignGivethBridge } = require('giveth-bridge');
const { LPPCampaignFactory, LPPCampaign } = require('lpp-campaign');
const { LPPCappedMilestoneFactory, LPPCappedMilestone } = require('lpp-capped-milestone');

const keys = require('./keys.js');

const homeWeb3 = new Web3('https://ropsten.infura.io');
const foreignWeb3 = new Web3('https://rinkeby.giveth.io');

const ropstenPK = keys.ropsten;
const rinkebyPK = keys.rinkeby;
const bridgePK = keys.bridge;
const homeAccount = homeWeb3.eth.accounts.privateKeyToAccount(ropstenPK);
const foreignAccount = foreignWeb3.eth.accounts.privateKeyToAccount(rinkebyPK);
const bridgeAccount = foreignWeb3.eth.accounts.privateKeyToAccount(bridgePK);
homeWeb3.eth.accounts.wallet.add(homeAccount);
foreignWeb3.eth.accounts.wallet.add(foreignAccount);
foreignWeb3.eth.accounts.wallet.add(bridgeAccount);

const gasPrice = homeWeb3.utils.toWei('5.5', 'gwei');

async function deploy() {
  const { keccak256 } = foreignWeb3.utils;

  const bridgeAddy = bridgeAccount.address;

  const homeBridgeOwner = homeAccount.address;
  const securityGuard = homeAccount.address;

  const twentyFiveHrs = 60 * 60 * 25;
  const fortyEightHrs = 60 * 60 * 48;
  const fiveDays = 60 * 60 * 24 * 5;
  let homeBridge;
  // let homeToken;
  GivethBridge.new(
    homeWeb3,
    homeBridgeOwner,
    homeBridgeOwner,
    twentyFiveHrs,
    fortyEightHrs,
    securityGuard,
    fiveDays,
    {
      from: homeBridgeOwner,
      $extraGas: 100000,
      gasPrice,
    },
  )
    .on('transactionHash', txHash => console.log('givethBridge tx =>', txHash))
    .then(bridge => {
      homeBridge = bridge;
      return bridge.authorizeSpender(bridgeAddy, true, { from: homeBridgeOwner, gasPrice });
    });
  // .then(() => {
  // return StandardTokenTest.new(homeWeb3, { from: homeBridgeOwner, gasPrice }).on(
  // 'transactionHash',
  // txHash => console.log('homeToken tx =>', txHash),
  // );
  // })
  // .then(t => (homeToken = t));

  const foreignFrom = foreignAccount.address;

  let nonce = await foreignWeb3.eth.getTransactionCount(foreignFrom);

  let baseVault;
  LPVault.new(foreignWeb3, {
    from: foreignFrom,
    gasPrice,
    nonce,
  })
    .on('transactionHash', txHash => console.log('LPVault tx ->', txHash))
    .then(c => {
      baseVault = c;
    });
  nonce += 1;
  const baseLP = await LiquidPledging.new(foreignWeb3, {
    from: foreignFrom,
    gasPrice,
    nonce,
  }).on('transactionHash', txHash => console.log('LP tx ->', txHash));
  const lpFactory = await LPFactory.new(foreignWeb3, baseVault.$address, baseLP.$address, {
    from: foreignFrom,
    gasPrice,
    gas: 6700000,
  }).on('transactionHash', txHash => console.log('lpFactory tx =>', txHash));

  // TODO recoverVault should be a multisig at deployment time
  const recoveryVault = '0x8f5c03c2249cd35742efb6c2ed084e4e8f1773ee';
  const r = await lpFactory
    .newLP(foreignFrom, recoveryVault, { from: foreignFrom, gasPrice, $extraGas: 100000 })
    .on('transactionHash', txHash => console.log('lpFactory.newLP tx =>', txHash));

  const vaultAddress = r.events.DeployVault.returnValues.vault;
  const vault = new LPVault(foreignWeb3, vaultAddress);

  const lpAddress = r.events.DeployLiquidPledging.returnValues.liquidPledging;
  const liquidPledging = new LiquidPledging(foreignWeb3, lpAddress);

  nonce = await foreignWeb3.eth.getTransactionCount(foreignFrom);

  const tokenFactoryPromise = MiniMeTokenFactory.new(foreignWeb3, {
    from: foreignFrom,
    $extraGas: 100000,
    gasPrice,
    nonce,
  }).on('transactionHash', txHash => console.log('TokenFactory tx =>', txHash));
  nonce += 1;

  const kernel = new Kernel(foreignWeb3, await liquidPledging.kernel());
  const acl = new ACL(foreignWeb3, await kernel.acl());
  acl
    .createPermission(
      foreignFrom,
      vault.$address,
      await vault.CONFIRM_PAYMENT_ROLE(),
      foreignFrom,
      { from: foreignFrom, gasPrice, $extraGas: 100000, nonce },
    )
    .on('transactionHash', txHash => console.log('createPermission 1 tx =>', txHash));
  nonce += 1;
  await acl
    .createPermission(foreignFrom, vault.$address, await vault.SET_AUTOPAY_ROLE(), foreignFrom, {
      $extraGas: 100000,
      from: foreignFrom,
      gasPrice,
      nonce,
    })
    .on('transactionHash', txHash => console.log('createPermission 2 tx =>', txHash));
  nonce += 1;

  const tokenFactory = await tokenFactoryPromise;

  vault
    .setAutopay(true, { from: foreignFrom, $extraGas: 100000, gasPrice, nonce })
    .on('transactionHash', txHash => console.log('setAutopay tx =>', txHash));
  nonce += 1;

  const CREATE_PERMISSION_ROLE = await acl.CREATE_PERMISSIONS_ROLE();

  // deploy campaign plugin
  const lppCampaignFactory = await LPPCampaignFactory.new(foreignWeb3, kernel.$address, {
    from: foreignFrom,
    gasPrice,
    nonce,
  }).on('transactionHash', txHash => console.log('campaignFactory->', txHash));
  nonce += 1;

  acl
    .grantPermission(lppCampaignFactory.$address, acl.$address, CREATE_PERMISSION_ROLE, {
      from: foreignFrom,
      gasPrice,
      nonce,
    })
    .on('transactionHash', txHash => console.log('grantPermission ->', txHash));
  nonce += 1;
  acl
    .grantPermission(
      lppCampaignFactory.$address,
      liquidPledging.$address,
      keccak256('PLUGIN_MANAGER_ROLE'),
      { from: foreignFrom, gasPrice, nonce },
    )
    .on('transactionHash', txHash => console.log('grantPermission ->', txHash));
  nonce += 1;

  const campaignApp = await LPPCampaign.new(foreignWeb3, {
    from: foreignFrom,
    gasPrice,
    nonce,
  }).on('transactionHash', txHash => console.log('campaignApp ->', txHash));
  nonce += 1;

  kernel.setApp(keccak256('base'), keccak256('lpp-campaign'), campaignApp.$address, {
    from: foreignFrom,
    gasPrice,
    nonce,
  });
  nonce += 1;

  console.log('here');
  // deploy milestone plugin
  const lppCappedMilestoneFactory = await LPPCappedMilestoneFactory.new(
    foreignWeb3,
    kernel.$address,
    { from: foreignFrom, gasPrice, nonce },
  ).on('transactionHash', txHash => console.log('milestoneFactory ->', txHash));
  console.log('here');
  nonce += 1;
  acl.grantPermission(lppCappedMilestoneFactory.$address, acl.$address, CREATE_PERMISSION_ROLE, {
    from: foreignFrom,
    gasPrice,
    nonce,
  });
  nonce += 1;
  acl.grantPermission(
    lppCappedMilestoneFactory.$address,
    liquidPledging.$address,
    await liquidPledging.PLUGIN_MANAGER_ROLE(),
    { from: foreignFrom, gasPrice, nonce },
  );
  nonce += 1;

  const milestoneApp = await LPPCappedMilestone.new(foreignWeb3, {
    from: foreignFrom,
    gasPrice,
    nonce,
  }).on('transactionHash', txHash => console.log('milestoneApp ->', txHash));
  nonce += 1;
  await kernel.setApp(keccak256('base'), keccak256('lpp-capped-milestone'), milestoneApp.$address, {
    from: foreignFrom,
    gasPrice,
    nonce,
  });

  const foreignBridge = await ForeignGivethBridge.new(
    foreignWeb3,
    foreignFrom,
    foreignFrom,
    tokenFactory.$address,
    liquidPledging.$address,
    bridgeAddy,
    [],
    [],
    { from: foreignFrom, $extraGas: 100000, gasPrice },
  ).on('transactionHash', txHash => console.log('foreignBridge tx =>', txHash));

  await kernel
    .setApp(keccak256('app'), keccak256('ForeignGivethBridge'), foreignBridge.$address, {
      from: foreignFrom,
      gasPrice,
    })
    .on('transactionHash', txHash => console.log('setting ForeignGivethBridge app =>', txHash));

  await foreignBridge
    .addToken(0, 'Ropsten ETH', 18, 'ROP_ETH', { from: foreignFrom, gasPrice })
    .on('transactionHash', txHash => console.log('foreignBridge.addToken tx =>', txHash));
  const foreignEthAddress = await foreignBridge.tokenMapping(0);

  console.log({
    homeBridge: homeBridge.$address,
    // homeToken: homeToken.$address,
    foreignBridge: foreignBridge.$address,
    lpFactory: lpFactory.$address,
    liquidPledging: liquidPledging.$address,
    vault: vault.$address,
    foreignEth: foreignEthAddress,
    lppCampaignFactory: lppCampaignFactory.$address,
    lppCappedMilestoneFactory: lppCappedMilestoneFactory.$address,
  });
  process.exit(); // some reason, this script won't exit. I think it has to do with web3 subscribing to tx confirmations?
}

process.on('unhandledRejection', (reason, p) =>
  console.error('Unhandled Rejection at: Promise ', p, reason),
);

deploy();
