/* eslint-disable import/no-extraneous-dependencies */
const Web3 = require('web3');
const { LiquidPledging, LPVault, LPFactory, Kernel, ACL } = require('giveth-liquidpledging');
const { MiniMeTokenFactory } = require('minimetoken');
const { GivethBridge, ForeignGivethBridge } = require('giveth-bridge');
const { LPPCampaignFactory, LPPCampaign } = require('lpp-campaign');
const { LPPCappedMilestoneFactory, LPPCappedMilestone } = require('lpp-capped-milestone');

const keys = require('./keys.js');

const homeWeb3 = new Web3('https://mew.giveth.io');
const foreignWeb3 = new Web3('https://rinkeby.giveth.io');

const PK = keys.mainnet;
const rinkebyPK = keys.rinkeby;
const homeAccount = homeWeb3.eth.accounts.privateKeyToAccount(PK);
const foreignAccount = foreignWeb3.eth.accounts.privateKeyToAccount(rinkebyPK);
homeWeb3.eth.accounts.wallet.add(homeAccount);
foreignWeb3.eth.accounts.wallet.add(foreignAccount);

const gasPrice = homeWeb3.utils.toWei('5.5', 'gwei');
const homeGasPrice = homeWeb3.utils.toWei('3.5', 'gwei');

async function deploy() {
  const { keccak256 } = foreignWeb3.utils;

  // these addresses should probably be changed
  const bridgeAddy = '0xa27243046e16ee596D19Ff3091719160527e469a';
  const homeBridgeESCaller = '0x1e9f6746147e937e8e1c29180e15af0bd5fd64bb';
  const homeBridgeESDestination = '0x16fda2fcc887dd7ac65c46be144473067cff8654';

  const givethMultisigRinkeby = '0x20fc2ec2518dec7041b4c3e82663d6071bae953f';
  const esCallerRinkeby = '0xc3b2128ca330871037d35fdc5f7b05e195aac5ce';

  const homeBridgeOwner = homeAccount.address;
  const securityGuard = '0xDAa172456F5815256831aeE19C8A370a83522871';

  const twentyFiveHrs = 60 * 60 * 25;
  const fortyEightHrs = 60 * 60 * 48;
  const thirtyDays = 60 * 60 * 24 * 30;
  let homeBridge;
  await GivethBridge.new(
    homeWeb3,
    homeBridgeESCaller,
    homeBridgeESDestination,
    twentyFiveHrs,
    fortyEightHrs,
    securityGuard,
    thirtyDays,
    {
      from: homeBridgeOwner,
      $extraGas: 100000,
      gasPrice: homeGasPrice,
    },
  )
    .on('transactionHash', txHash => console.log('givethBridge tx =>', txHash))
    .then(bridge => {
      homeBridge = bridge;
      return bridge
        .authorizeSpender(bridgeAddy, true, {
          from: homeBridgeOwner,
          gasPrice: homeGasPrice,
        })
        .then(() =>
          bridge.changeOwnership('0x8f951903c9360345b4e1b536c7f5ae8f88a64e79', {
            from: homeBridgeOwner,
            gasPrice: homeGasPrice,
          }),
        );
    });

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

  const recoveryVault = givethMultisigRinkeby;
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
  await acl
    .createPermission(foreignFrom, vault.$address, await vault.SET_AUTOPAY_ROLE(), foreignFrom, {
      $extraGas: 100000,
      from: foreignFrom,
      gasPrice,
      nonce,
    })
    .on('transactionHash', txHash => console.log('createPermission 1 tx =>', txHash));
  nonce += 1;

  acl
    .grantPermission(esCallerRinkeby, vault.$address, await vault.ESCAPE_HATCH_CALLER_ROLE(), {
      $extraGas: 100000,
      from: foreignFrom,
      gasPrice,
      nonce,
    })
    .on('transactionHash', txHash => console.log('grantPermission 1 tx =>', txHash));
  nonce += 1;

  acl
    .revokePermission(foreignFrom, vault.$address, await vault.ESCAPE_HATCH_CALLER_ROLE(), {
      $extraGas: 100000,
      from: foreignFrom,
      gasPrice,
      nonce,
    })
    .on('transactionHash', txHash => console.log('revokePermission 1 tx =>', txHash));
  nonce += 1;

  acl
    .setPermissionManager(
      givethMultisigRinkeby,
      vault.$address,
      await vault.ESCAPE_HATCH_CALLER_ROLE(),
      {
        $extraGas: 100000,
        from: foreignFrom,
        gasPrice,
        nonce,
      },
    )
    .on('transactionHash', txHash => console.log('setPermissionManager 1 tx =>', txHash));
  nonce += 1;

  vault
    .setAutopay(true, { from: foreignFrom, $extraGas: 100000, gasPrice, nonce })
    .on('transactionHash', txHash => console.log('setAutopay tx =>', txHash));
  nonce += 1;

  acl
    .revokePermission(foreignFrom, vault.$address, await vault.SET_AUTOPAY_ROLE(), {
      $extraGas: 100000,
      from: foreignFrom,
      gasPrice,
      nonce,
    })
    .on('transactionHash', txHash => console.log('revokePermission 2 tx =>', txHash));
  nonce += 1;

  acl
    .setPermissionManager(0, vault.$address, await vault.SET_AUTOPAY_ROLE(), {
      $extraGas: 100000,
      from: foreignFrom,
      gasPrice,
      nonce,
    })
    .on('transactionHash', txHash => console.log('setPermissionManager 2 tx =>', txHash));
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
      await liquidPledging.PLUGIN_MANAGER_ROLE(),
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

  // deploy milestone plugin
  const lppCappedMilestoneFactory = await LPPCappedMilestoneFactory.new(
    foreignWeb3,
    kernel.$address,
    {
      from: foreignFrom,
      gasPrice,
      nonce,
    },
  ).on('transactionHash', txHash => console.log('milestoneFactory ->', txHash));
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

  const tokenFactory = await tokenFactoryPromise;

  console.log({
    homeBridge: homeBridge.$address,
    lpFactory: lpFactory.$address,
    liquidPledging: liquidPledging.$address,
    vault: vault.$address,
    lppCampaignFactory: lppCampaignFactory.$address,
    lppCappedMilestoneFactory: lppCappedMilestoneFactory.$address,
  });

  const foreignBridge = await ForeignGivethBridge.new(
    foreignWeb3,
    esCallerRinkeby,
    givethMultisigRinkeby,
    tokenFactory.$address,
    liquidPledging.$address,
    bridgeAddy,
    [],
    [],
    { from: foreignFrom, $extraGas: 100000, gasPrice },
  ).on('transactionHash', txHash => console.log('foreignBridge tx =>', txHash));

  console.log({
    foreignBridge: foreignBridge.$address,
  });

  nonce = await foreignWeb3.eth.getTransactionCount(foreignFrom);

  kernel
    .setApp(keccak256('app'), keccak256('ForeignGivethBridge'), foreignBridge.$address, {
      from: foreignFrom,
      gasPrice,
      nonce,
    })
    .on('transactionHash', txHash => console.log('setting ForeignGivethBridge app =>', txHash));
  nonce += 1;

  foreignBridge
    .addToken(0, 'GivETH', 18, 'GivETH', { from: foreignFrom, gasPrice, nonce })
    .on('transactionHash', txHash => console.log('foreignBridge.addToken tx =>', txHash));
  nonce += 1;

  // revoke permissions now
  foreignBridge.changeOwnership(givethMultisigRinkeby, { from: foreignFrom, gasPrice, nonce });
  nonce += 1;

  acl
    .grantPermission(
      givethMultisigRinkeby,
      liquidPledging.$address,
      await liquidPledging.PLUGIN_MANAGER_ROLE(),
      {
        $extraGas: 100000,
        from: foreignFrom,
        gasPrice,
        nonce,
      },
    )
    .on('transactionHash', txHash => console.log('grantPermission 3 tx =>', txHash));
  nonce += 1;

  acl
    .revokePermission(
      foreignFrom,
      liquidPledging.$address,
      await liquidPledging.PLUGIN_MANAGER_ROLE(),
      {
        $extraGas: 100000,
        from: foreignFrom,
        gasPrice,
        nonce,
      },
    )
    .on('transactionHash', txHash => console.log('revokePermission 3 tx =>', txHash));
  nonce += 1;

  acl
    .setPermissionManager(
      givethMultisigRinkeby,
      liquidPledging.$address,
      await liquidPledging.PLUGIN_MANAGER_ROLE(),
      {
        $extraGas: 100000,
        from: foreignFrom,
        gasPrice,
        nonce,
      },
    )
    .on('transactionHash', txHash => console.log('setPermissionManager 3 tx =>', txHash));
  nonce += 1;

  acl
    .grantPermission(givethMultisigRinkeby, kernel.$address, await kernel.APP_MANAGER_ROLE(), {
      $extraGas: 100000,
      from: foreignFrom,
      gasPrice,
      nonce,
    })
    .on('transactionHash', txHash => console.log('grantPermission 4 tx =>', txHash));
  nonce += 1;

  acl
    .revokePermission(foreignFrom, kernel.$address, await kernel.APP_MANAGER_ROLE(), {
      $extraGas: 100000,
      from: foreignFrom,
      gasPrice,
      nonce,
    })
    .on('transactionHash', txHash => console.log('revokePermission 4 tx =>', txHash));
  nonce += 1;

  acl
    .setPermissionManager(givethMultisigRinkeby, kernel.$address, await kernel.APP_MANAGER_ROLE(), {
      $extraGas: 100000,
      from: foreignFrom,
      gasPrice,
      nonce,
    })
    .on('transactionHash', txHash => console.log('setPermissionManager 4 tx =>', txHash));
  nonce += 1;

  acl
    .grantPermission(givethMultisigRinkeby, acl.$address, await acl.CREATE_PERMISSIONS_ROLE(), {
      $extraGas: 100000,
      from: foreignFrom,
      gasPrice,
      nonce,
    })
    .on('transactionHash', txHash => console.log('grantPermission 5 tx =>', txHash));
  nonce += 1;

  acl
    .revokePermission(foreignFrom, acl.$address, await acl.CREATE_PERMISSIONS_ROLE(), {
      $extraGas: 100000,
      from: foreignFrom,
      gasPrice,
      nonce,
    })
    .on('transactionHash', txHash => console.log('revokePermission 5 tx =>', txHash));
  nonce += 1;

  await acl
    .setPermissionManager(
      givethMultisigRinkeby,
      acl.$address,
      await acl.CREATE_PERMISSIONS_ROLE(),
      {
        $extraGas: 100000,
        from: foreignFrom,
        gasPrice,
        nonce,
      },
    )
    .on('transactionHash', txHash => console.log('setPermissionManager 5 tx =>', txHash));

  // TODO after verifying deployment, change GivethBridge owner to old multisig

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
