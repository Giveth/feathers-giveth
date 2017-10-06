const Web3 = require('web3');
const Vault = require('liquidpledging').Vault;

const web3 = new Web3("ws://localhost:8546");

async function confirmPayments() {
  const vault = new Vault(web3, '0xe78A0F7E598Cc8b0Bb87894B0F60dD2a88d6a8Ab');

  const nPayments = await vault.nPayments();
  const paymentsToConfirm = [];

  for (let i = 0; i < nPayments; i++) {
    const payment = await vault.payments(i);

    if (payment.state === '0') { // Pending
      paymentsToConfirm.push(i);
    }
  }

  if (paymentsToConfirm.length > 0) {
    await vault.multiConfirm(paymentsToConfirm);
  }

  console.log('confirmedPayments:', paymentsToConfirm);
  process.exit();  // some reason, this script won't exit. I think it has to do with web3 subscribing to tx confirmations?
}

confirmPayments();
