const Web3 = require('web3');
const { LiquidPledging, LPVault } = require('giveth-liquidpledging-token');
const { LPPCappedMilestones, LPPCappedMilestonesRuntimeByteCode} = require('lpp-capped-milestone');

const web3 = new Web3('wss://rinkeby.giveth.io:8546');
// const web3 = new Web3('ws://network.giveth.io:8546');

const pk = '0x867884ad8454e1c516681fd376565c1f02e3027cab5ce4fcedd99b80f2c73cd6';
// const pk = '0x5b91ef7edd09ace1cc7f1fe2c7933082e331c5406664e49e00ea68a97d756a8f';
const account = web3.eth.accounts.privateKeyToAccount(pk);
const from = account.address;
web3.eth.accounts.wallet.add(account);

const gasPrice = web3.utils.toWei('20', 'gwei');

const lpAddress = "0x1B8F84E443668C81FeE5BEc266bc098e3c7fBC00";
// const lpAddress = "0xc2E1c6cf5D18247d63618dABf58E14F058D02c7C";
async function deploy() {
  const liquidPledging = new LiquidPledging(web3, lpAddress);

  let nonce = await web3.eth.getTransactionCount(from);

  // liquidPledging.addValidPlugin(web3.utils.keccak256(LPPCappedMilestonesRuntimeByteCode), { from, gasPrice, nonce }).on('transactionHash', txHash => console.log(`lp add milestone plugin:  ${txHash}`));

  const cappedMilestones = await LPPCappedMilestones.new(web3, liquidPledging.$address, from, from, { from, gasPrice }).on('transactionHash', txHash => console.log(`deploy LPPCappedMilestones:  ${txHash}`));

  console.log('LPPCappedMilestones Address: ', cappedMilestones.$address);
  process.exit(); // some reason, this script won't exit. I think it has to do with web3 subscribing to tx confirmations?
}

process.on('unhandledRejection', (reason, p) =>
  console.error('Unhandled Rejection at: Promise ', p, reason));

deploy();
