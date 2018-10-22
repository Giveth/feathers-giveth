/* eslint-disable import/no-extraneous-dependencies */
const Web3 = require('web3');
const { GivethBridge } = require('giveth-bridge');

const keys = require('./keys.js');

const homeWeb3 = new Web3('https://ropsten.infura.io');

const ropstenPK = keys.ropsten;
const bridgePK = keys.bridge;
const homeAccount = homeWeb3.eth.accounts.privateKeyToAccount(ropstenPK);
const bridgeAccount = homeWeb3.eth.accounts.privateKeyToAccount(bridgePK);
homeWeb3.eth.accounts.wallet.add(homeAccount);

const gasPrice = homeWeb3.utils.toWei('25.5', 'gwei');

async function deploy() {
  const bridgeAddy = bridgeAccount.address;
  const from = homeAccount.address;

  const currentHomeBridge = new GivethBridge(
    homeWeb3,
    '0x8588EE5E97e06bA863FDB2EBc5b523246D459638',
  );

  let nonce = await homeWeb3.eth.getTransactionCount(from);
  currentHomeBridge.pause({ from, gasPrice, nonce }).then(() => {
    console.log('bridge is now paused');
  });
  nonce += 1;

  currentHomeBridge.escapeHatch(0, { from, gasPrice, nonce });
  nonce += 1;

  const twentyFiveHrs = 60 * 60 * 25;
  const fortyEightHrs = 60 * 60 * 48;
  const fiveDays = 60 * 60 * 24 * 5;
  const homeBridge = await GivethBridge.new(
    homeWeb3,
    from,
    from,
    twentyFiveHrs,
    fortyEightHrs,
    from,
    fiveDays,
    {
      from,
      $extraGas: 100000,
      gasPrice,
      nonce,
    },
  ).on('transactionHash', txHash => console.log('givethBridge tx =>', txHash));

  await homeBridge.authorizeSpender(bridgeAddy, true, { from, gasPrice });

  console.log({
    homeBridge: homeBridge.$address,
  });
  process.exit(); // some reason, this script won't exit. I think it has to do with web3 subscribing to tx confirmations?
}

process.on('unhandledRejection', (reason, p) =>
  console.error('Unhandled Rejection at: Promise ', p, reason),
);

deploy();
