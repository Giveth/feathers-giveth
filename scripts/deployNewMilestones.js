/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable no-console */
const Web3 = require('web3');
const { LiquidPledging, Kernel, ACL } = require('giveth-liquidpledging');
const { BridgedMilestone, LPMilestone, MilestoneFactory } = require('lpp-milestones');

const keys = require('./keys.js');

const foreignWeb3 = new Web3('https://rinkeby.giveth.io');

const rinkebyPK = keys.rinkeby;
const foreignAccount = foreignWeb3.eth.accounts.privateKeyToAccount(rinkebyPK);
foreignWeb3.eth.accounts.wallet.add(foreignAccount);

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
    const foreignFrom = foreignAccount.address;

    let nonce = await foreignWeb3.eth.getTransactionCount(foreignFrom);

    // TODO: update this when running script
    const lpAddress = '0xf0e0F5A752f69Ee6dCfEed138520f6821357dc32';

    const liquidPledging = new LiquidPledging(foreignWeb3, lpAddress);

    const kernel = new Kernel(foreignWeb3, await liquidPledging.kernel());
    const acl = new ACL(foreignWeb3, await kernel.acl());

    const CREATE_PERMISSION_ROLE = await acl.CREATE_PERMISSIONS_ROLE();

    // deploy milestone plugin
    const milestoneFactory = await MilestoneFactory.new(foreignWeb3, kernel.$address, {
      from: foreignFrom,
      gasPrice: foreignGasPrice,
      nonce,
    })
      .on('transactionHash', txHash => console.log('milestoneFactory ->', txHash))
      .catch(e => {
        console.error('Error deploying MilestoneFactory');
        reject(e);
      });
    nonce += 1;
    acl.grantPermission(milestoneFactory.$address, acl.$address, CREATE_PERMISSION_ROLE, {
      from: foreignFrom,
      gasPrice: foreignGasPrice,
      nonce,
    });
    nonce += 1;
    await acl.grantPermission(
      milestoneFactory.$address,
      kernel.$address,
      await kernel.APP_MANAGER_ROLE(),
      {
        from: foreignFrom,
        gasPrice: foreignGasPrice,
        nonce,
      },
    );
    nonce += 1;
    acl.grantPermission(
      milestoneFactory.$address,
      liquidPledging.$address,
      await liquidPledging.PLUGIN_MANAGER_ROLE(),
      { from: foreignFrom, gasPrice: foreignGasPrice, nonce },
    );
    nonce += 1;

    const lpMilestoneApp = LPMilestone.new(foreignWeb3, {
      from: foreignFrom,
      gasPrice: foreignGasPrice,
      nonce,
    })
      .on('transactionHash', txHash => console.log('lpMilestoneApp ->', txHash))
      .catch(e => {
        console.error('Error deploying lpMilestoneApp');
        reject(e);
      });
    nonce += 1;
    const bridgedMilestoneApp = await BridgedMilestone.new(foreignWeb3, {
      from: foreignFrom,
      gasPrice: foreignGasPrice,
      nonce,
    })
      .on('transactionHash', txHash => console.log('bridgedMilestoneApp ->', txHash))
      .catch(e => {
        console.error('Error deploying bridgedMilestoneApp');
        reject(e);
      });
    nonce += 1;

    kernel.setApp(
      await kernel.APP_BASES_NAMESPACE(),
      await milestoneFactory.BRIDGED_MILESTONE_APP_ID(),
      bridgedMilestoneApp.$address,
      { from: foreignFrom, gasPrice: foreignGasPrice, nonce },
    );
    nonce += 1;

    await kernel.setApp(
      await kernel.APP_BASES_NAMESPACE(),
      await milestoneFactory.LP_MILESTONE_APP_ID(),
      lpMilestoneApp.$address,
      { from: foreignFrom, gasPrice: foreignGasPrice, nonce },
    );

    console.log('-----------------------');
    console.log({
      milestoneFactory: milestoneFactory.$address,
    });
    resolve();
  });
}

process.on('unhandledRejection', (reason, p) =>
  console.error('Unhandled Rejection at: Promise ', p, reason),
);

async function runDeploy() {
  try {
    const foreignBefore = await getBlockAndBalance(foreignWeb3, foreignAccount.address);

    console.log(
      `Foreign Block Number: ${foreignBefore.blockNum} Balance: ${foreignWeb3.utils.fromWei(
        foreignBefore.balance,
      )}`,
    );
    console.log('-----------------------');

    await deploy();

    const foreignAfter = await getBlockAndBalance(foreignWeb3, foreignAccount.address);

    console.log('-----------------------');
    console.log(
      `Foreign Block Number: ${foreignAfter.blockNum} Balance: ${foreignWeb3.utils.fromWei(
        foreignAfter.balance,
      )}`,
    );
    console.log('-----------------------');
    console.log(
      `Cost foreign: ${foreignWeb3.utils.fromWei(
        foreignWeb3.utils
          .toBN(foreignBefore.balance)
          .sub(foreignWeb3.utils.toBN(foreignAfter.balance)),
      )}`,
    );
  } catch (e) {
    console.error(e);
  }
  process.exit(); // some reason, this script won't exit. I think it has to do with web3 subscribing to tx confirmations?
}

runDeploy();
