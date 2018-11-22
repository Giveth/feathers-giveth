/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable no-console */
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

const homeGasPrice = homeWeb3.utils.toWei('6', 'gwei');
const foreignGasPrice = foreignWeb3.utils.toWei('10', 'gwei');

function getBlockAndBalance(w3, address) {
  return new Promise(async (resolve, reject) => {
    try {
      resolve({
        blockNum: await w3.eth.getBlockNumber(),
        balance: await w3.eth.getBalance(address),
      });
    } catch (e) {
      reject(e);
    }
  });
}

function deploy() {
  return new Promise(async (resolve, reject) => {
    const { keccak256 } = foreignWeb3.utils;

    const bridgeAddy = bridgeAccount.address;

    const homeBridgeOwner = homeAccount.address;
    const securityGuard = homeAccount.address;

    const twentyFiveHrs = 60 * 60 * 25;
    const fortyEightHrs = 60 * 60 * 48;
    const fiveDays = 60 * 60 * 24 * 5;
    const homeBridge = await GivethBridge.new(
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
        gasPrice: homeGasPrice,
      },
    )
      .on('transactionHash', txHash => console.log('givethBridge tx =>', txHash))
      .catch(e => {
        console.error('Error deploying homeBridge');
        reject(e);
      });

    await homeBridge
      .authorizeSpender(bridgeAddy, true, { from: homeBridgeOwner, gasPrice: homeGasPrice })
      .catch(e => {
        console.error('Error authorizeSpender on homeBridge');
        reject(e);
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

    const baseVault = await LPVault.new(foreignWeb3, {
      from: foreignFrom,
      gasPrice: foreignGasPrice,
      nonce,
    })
      .on('transactionHash', txHash => console.log('LPVault tx ->', txHash))
      .catch(e => {
        console.error('Error deploying baseVault');
        reject(e);
      });
    nonce += 1;
    const baseLP = await LiquidPledging.new(foreignWeb3, {
      from: foreignFrom,
      gasPrice: foreignGasPrice,
      nonce,
    })
      .on('transactionHash', txHash => console.log('LP tx ->', txHash))
      .catch(e => {
        console.error('Error deploying baseLP');
        reject(e);
      });
    const lpFactory = await LPFactory.new(foreignWeb3, baseVault.$address, baseLP.$address, {
      from: foreignFrom,
      gasPrice: foreignGasPrice,
      gas: 6700000,
    })
      .on('transactionHash', txHash => console.log('lpFactory tx =>', txHash))
      .catch(e => {
        console.error('Error deploying lpFactory');
        reject(e);
      });

    // TODO recoverVault should be a multisig at deployment time
    const recoveryVault = '0x8f5c03c2249cd35742efb6c2ed084e4e8f1773ee';
    const r = await lpFactory
      .newLP(foreignFrom, recoveryVault, {
        from: foreignFrom,
        gasPrice: foreignGasPrice,
        $extraGas: 100000,
      })
      .on('transactionHash', txHash => console.log('recoveryVault tx =>', txHash));

    const vaultAddress = r.events.DeployVault.returnValues.vault;
    const vault = new LPVault(foreignWeb3, vaultAddress);

    const lpAddress = r.events.DeployLiquidPledging.returnValues.liquidPledging;
    const liquidPledging = new LiquidPledging(foreignWeb3, lpAddress);

    nonce = await foreignWeb3.eth.getTransactionCount(foreignFrom);

    const tokenFactoryPromise = MiniMeTokenFactory.new(foreignWeb3, {
      from: foreignFrom,
      $extraGas: 100000,
      gasPrice: foreignGasPrice,
      nonce,
    })
      .on('transactionHash', txHash => console.log('TokenFactory tx =>', txHash))
      .catch(e => {
        console.error('Error deploying tokenFactory');
        reject(e);
      });
    nonce += 1;

    const kernel = new Kernel(foreignWeb3, await liquidPledging.kernel());
    const acl = new ACL(foreignWeb3, await kernel.acl());
    acl
      .createPermission(
        foreignFrom,
        vault.$address,
        await vault.CONFIRM_PAYMENT_ROLE(),
        foreignFrom,
        { from: foreignFrom, gasPrice: foreignGasPrice, $extraGas: 100000, nonce },
      )
      .on('transactionHash', txHash => console.log('createPermission 1 tx =>', txHash))
      .catch(e => {
        console.error('Error deploying acl');
        reject(e);
      });

    nonce += 1;
    await acl
      .createPermission(foreignFrom, vault.$address, await vault.SET_AUTOPAY_ROLE(), foreignFrom, {
        $extraGas: 100000,
        from: foreignFrom,
        gasPrice: foreignGasPrice,
        nonce,
      })
      .on('transactionHash', txHash => console.log('createPermission 2 tx =>', txHash));
    nonce += 1;

    const tokenFactory = await tokenFactoryPromise;

    vault
      .setAutopay(true, { from: foreignFrom, $extraGas: 100000, gasPrice: foreignGasPrice, nonce })
      .on('transactionHash', txHash => console.log('setAutopay tx =>', txHash))
      .catch(e => {
        console.error('Error setting autopay on vault');
        reject(e);
      });
    nonce += 1;

    const CREATE_PERMISSION_ROLE = await acl.CREATE_PERMISSIONS_ROLE();

    // deploy campaign plugin
    const lppCampaignFactory = await LPPCampaignFactory.new(foreignWeb3, kernel.$address, {
      from: foreignFrom,
      gasPrice: foreignGasPrice,
      nonce,
    })
      .on('transactionHash', txHash => console.log('campaignFactory->', txHash))
      .catch(e => {
        console.error('Error deploying lppCampaignFactory');
        reject(e);
      });
    nonce += 1;

    acl
      .grantPermission(lppCampaignFactory.$address, acl.$address, CREATE_PERMISSION_ROLE, {
        from: foreignFrom,
        gasPrice: foreignGasPrice,
        nonce,
      })
      .on('transactionHash', txHash => console.log('grantPermission ->', txHash));
    nonce += 1;
    acl
      .grantPermission(
        lppCampaignFactory.$address,
        liquidPledging.$address,
        keccak256('PLUGIN_MANAGER_ROLE'),
        { from: foreignFrom, gasPrice: foreignGasPrice, nonce },
      )
      .on('transactionHash', txHash => console.log('grantPermission ->', txHash));
    nonce += 1;

    const campaignApp = await LPPCampaign.new(foreignWeb3, {
      from: foreignFrom,
      gasPrice: foreignGasPrice,
      nonce,
    })
      .on('transactionHash', txHash => console.log('campaignApp ->', txHash))
      .catch(e => {
        console.error('Error deploying campaignApp');
        reject(e);
      });
    nonce += 1;

    kernel.setApp(keccak256('base'), keccak256('lpp-campaign'), campaignApp.$address, {
      from: foreignFrom,
      gasPrice: foreignGasPrice,
      nonce,
    });
    nonce += 1;

    // deploy milestone plugin
    const lppCappedMilestoneFactory = await LPPCappedMilestoneFactory.new(
      foreignWeb3,
      kernel.$address,
      { from: foreignFrom, gasPrice: foreignGasPrice, nonce },
    )
      .on('transactionHash', txHash => console.log('milestoneFactory ->', txHash))
      .catch(e => {
        console.error('Error deploying lppCappedMilestoneFactory');
        reject(e);
      });
    nonce += 1;
    acl.grantPermission(lppCappedMilestoneFactory.$address, acl.$address, CREATE_PERMISSION_ROLE, {
      from: foreignFrom,
      gasPrice: foreignGasPrice,
      nonce,
    });
    nonce += 1;
    acl.grantPermission(
      lppCappedMilestoneFactory.$address,
      liquidPledging.$address,
      await liquidPledging.PLUGIN_MANAGER_ROLE(),
      { from: foreignFrom, gasPrice: foreignGasPrice, nonce },
    );
    nonce += 1;

    const milestoneApp = await LPPCappedMilestone.new(foreignWeb3, {
      from: foreignFrom,
      gasPrice: foreignGasPrice,
      nonce,
    })
      .on('transactionHash', txHash => console.log('milestoneApp ->', txHash))
      .catch(e => {
        console.error('Error deploying milestoneApp');
        reject(e);
      });
    nonce += 1;
    await kernel.setApp(
      keccak256('base'),
      keccak256('lpp-capped-milestone'),
      milestoneApp.$address,
      {
        from: foreignFrom,
        gasPrice: foreignGasPrice,
        nonce,
      },
    );

    const foreignBridge = await ForeignGivethBridge.new(
      foreignWeb3,
      foreignFrom,
      foreignFrom,
      tokenFactory.$address,
      liquidPledging.$address,
      bridgeAddy,
      [],
      [],
      { from: foreignFrom, $extraGas: 100000, gasPrice: foreignGasPrice },
    )
      .on('transactionHash', txHash => console.log('foreignBridge tx =>', txHash))
      .catch(e => {
        console.error('Error deploying foreignBridge');
        reject(e);
      });

    await kernel
      .setApp(keccak256('app'), keccak256('ForeignGivethBridge'), foreignBridge.$address, {
        from: foreignFrom,
        gasPrice: foreignGasPrice,
      })
      .on('transactionHash', txHash => console.log('setting ForeignGivethBridge app =>', txHash));

    await foreignBridge
      .addToken(0, 'Ropsten ETH', 18, 'ROP_ETH', { from: foreignFrom, gasPrice: foreignGasPrice })
      .on('transactionHash', txHash => console.log('foreignBridge.addToken tx =>', txHash));
    const foreignEthAddress = await foreignBridge.tokenMapping(0);

    console.log('-----------------------');
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
    resolve();
  });
}

process.on('unhandledRejection', (reason, p) =>
  console.error('Unhandled Rejection at: Promise ', p, reason),
);

async function runDeploy() {
  try {
    const homeBefore = await getBlockAndBalance(homeWeb3, homeAccount.address);
    const foreignBefore = await getBlockAndBalance(foreignWeb3, foreignAccount.address);

    console.log(
      `Home Block Number: ${homeBefore.blockNum} Balance: ${homeWeb3.utils.fromWei(
        homeBefore.balance,
      )}`,
    );
    console.log(
      `Foreign Block Number: ${foreignBefore.blockNum} Balance: ${foreignWeb3.utils.fromWei(
        foreignBefore.balance,
      )}`,
    );
    console.log('-----------------------');

    await deploy();

    const homeAfter = await getBlockAndBalance(homeWeb3, homeAccount.address);
    const foreignAfter = await getBlockAndBalance(foreignWeb3, foreignAccount.address);

    console.log('-----------------------');
    console.log(
      `Home Block Number: ${homeAfter.blockNum} Balance: ${homeWeb3.utils.fromWei(
        homeAfter.balance,
      )}`,
    );
    console.log(
      `Foreign Block Number: ${foreignAfter.blockNum} Balance: ${foreignWeb3.utils.fromWei(
        foreignAfter.balance,
      )}`,
    );
    console.log('-----------------------');
    console.log(
      `Cost home: ${homeWeb3.utils.fromWei(
        homeWeb3.utils.toBN(homeBefore.balance).sub(homeWeb3.utils.toBN(homeAfter.balance)),
      )}`,
    );
    console.log(
      `Cost foreigh: ${foreignWeb3.utils.fromWei(
        foreignWeb3.utils
          .toBN(foreignBefore.balance)
          .sub(homeWeb3.utils.toBN(foreignAfter.balance)),
      )}`,
    );
  } catch (e) {
    console.error(e);
  }
  process.exit(); // some reason, this script won't exit. I think it has to do with web3 subscribing to tx confirmations?
}

runDeploy();
