import Web3 from 'web3';

const removeHexPrefix = hex => {
  if (hex && typeof hex === 'string' && hex.toLowerCase().startsWith('0x')) {
    return hex.substring(2);
  }
  return hex;
};

let web3;
function getWeb3() {
  if (web3) return web3;

  const app = this;
  const blockchain = app.get('blockchain');

  web3 = new Web3(blockchain.nodeUrl);
  return web3;
}

module.exports = {
  getWeb3,
  removeHexPrefix,
};
