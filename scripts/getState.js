const Web3 = require('web3');
const { LiquidPledging, LiquidPledgingState, LPVault } = require('giveth-liquidpledging');

const web3 = new Web3('ws://localhost:8545');

async function printState() {
  const liquidPledging = new LiquidPledging(web3, '0x5b1869D9A4C187F2EAa108f3062412ecf0526b24');
  const vault = new LPVault(web3, '0xe78A0F7E598Cc8b0Bb87894B0F60dD2a88d6a8Ab');
  const liquidPledgingState = new LiquidPledgingState(liquidPledging);

  const vaultSt = {
    payments: [],
  };
  const nPayments = await vault.nPayments();

  for (let i = 0; i < nPayments; i++) {
    const payment = await vault.payments(i);
    vaultSt.payments.push(payment);
  }

  const st = await liquidPledgingState.getState();
  console.log('vault state: ', JSON.stringify(vaultSt, null, 2));
  console.log('liquidPledging state: ', JSON.stringify(st, null, 2));
  process.exit(); // some reason, this script won't exit. I think it has to do with web3 subscribing to tx confirmations?
}

printState();
