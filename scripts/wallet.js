const Web3 = require('web3');
const fs = require('fs');
const minimetoken = require('minimetoken');
const { LPPDacs } = require('lpp-dacs');

const web3 = new Web3('https://api.myetherapi.com/eth');

const ks = fs.readFileSync('../keystores/metamask_0x502bd2529df24a36dfee57335791be0ee62f8c74.json').toString();
web3.eth.accounts.wallet.decrypt([ ks ], 'RipyYVjPpCcwmdE(qTdai9aQ');
from = web3.eth.accounts.wallet[ 0 ].address;

const gasPrice = web3.utils.toWei('1.01', 'gwei');

// clone token

let token = new minimetoken.MiniMeToken(web3, '');
token.createCloneToken(
  'Giveth Governance Token',
  18,
  'GGT',
  0,
  false,
  { from, gasPrice }
).on('transactionHash', console.log).on('receipt', console.log);


// change token controller!

token = new minimetoken.MiniMeToken(web3, '');
token.changeController('', { from, gasPrice })
  .on('transactionHash', console.log).on('receipt', console.log);



// deploy giveth dac!

const dacs = new LPPDacs(web3, '0x79bddecb728afda275923998701bac34d277fb19');
dacs.addDac(
 'Giveth DAC',
 '',
 259200,
 '',
 { from, gasPrice },
).on('transactionHash', console.log).on('receipt', console.log);

dacs.changeOwner(2, '0x839395e20bbb182fa440d08f850e6c7a8f6f0780', { from, gasPrice });


