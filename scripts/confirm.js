const Web3 = require('web3');
const { LPVault } = require('giveth-liquidpledging');

const web3 = new Web3('ws://localhost:8545');

async function confirmPayments() {
  const from = '0x90f8bf6a479f320ead074411a4b0e7944ea8c9c1';
  const vault = new LPVault(web3, '0xCfEB869F69431e42cdB54A4F4f105C19C080A601');

  const nPayments = await vault.nPayments();
  const paymentsToConfirm = [];

  for (let i = 0; i < nPayments; i++) {
    const payment = await vault.payments(i);

    if (payment.state === '0') {
      // Pending
      paymentsToConfirm.push(i);
    }
  }

  if (paymentsToConfirm.length > 0) {
    await vault.multiConfirm(paymentsToConfirm, { from });
  }

  console.log('confirmedPayments:', paymentsToConfirm);
  process.exit(); // some reason, this script won't exit. I think it has to do with web3 subscribing to tx confirmations?
}

confirmPayments();
