const Web3 = require('web3');
const { LiquidPledging, LiquidPledgingState, LPVault } = require('giveth-liquidpledging');

const web3 = new Web3('ws://localhost:8546');

async function printState() {
  const liquidPledging = new LiquidPledging(web3, '0xBeFdf675cb73813952C5A9E4B84ea8B866DBA592');
  const vault = new LPVault(web3, '0x6098441760E4614AAc6e6bb3Ec7A254C2a600b5d');
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
