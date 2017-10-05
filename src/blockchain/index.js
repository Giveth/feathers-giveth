import Web3 from 'web3';
import liquidpledging from 'liquidpledging';

import LiquidPledgingMonitor from './LiquidPledgingMonitor';

const LiquidPledging = liquidpledging.LiquidPledging(false);
const Vault = liquidpledging.Vault;

const networks = {
  main: {
    liquidPledgingAddress: '0x0',
    vaultAddress: '0x0',
  },
  morden: {
    liquidPledgingAddress: '0x0',
    vaultAddress: '0x0',
  },
  ropsten: {
    liquidPledgingAddress: '0x0',
    vaultAddress: '0x0',
  },
  rinkeby: {
    liquidPledgingAddress: '0x0',
    vaultAddress: '0x0',
  },
  kovan: {
    liquidPledgingAddress: '0x0',
    vaultAddress: '0x0',
  },
  default: {
    liquidPledgingAddress: '0x5b1869D9A4C187F2EAa108f3062412ecf0526b24',
    vaultAddress: '0xe78A0F7E598Cc8b0Bb87894B0F60dD2a88d6a8Ab',
  },

};

export default function () {
  const app = this;
  const blockchain = app.get('blockchain');

  const web3 = new Web3(blockchain.nodeUrl);

  const opts = {
    startingBlock: blockchain.startingBlock,
  };

  getLiquidPledging(web3)
    .then(liquidPledging => {
      const adminMonitor = new LiquidPledgingMonitor(app, liquidPledging, opts);
      adminMonitor.start();
    });
}

const getLiquidPledging = (web3) => {
  return web3.eth.net.getId()
    .then(id => {
      let liquidPledging;
      switch (id) {
        case 1:
          liquidPledging = new LiquidPledging(web3, networks.main.liquidPledgingAddress);
          liquidPledging.$vault = new Vault(web3, networks.main.vaultAddress);
          break;
        case 2:
          liquidPledging = new LiquidPledging(web3, networks.morden.liquidPledgingAddress);
          liquidPledging.$vault = new Vault(web3, networks.morden.vaultAddress);
          break;
        case 3:
          liquidPledging = new LiquidPledging(web3, networks.ropsten.liquidPledgingAddress);
          liquidPledging.$vault = new Vault(web3, networks.ropsten.vaultAddress);
          break;
        case 4:
          liquidPledging = new LiquidPledging(web3, networks.rinkeby.liquidPledgingAddress);
          liquidPledging.$vault = new Vault(web3, networks.rinkeby.vaultAddress);
          break;
        case 42:
          liquidPledging = new LiquidPledging(web3, networks.kovan.liquidPledgingAddress);
          liquidPledging.$vault = new Vault(web3, networks.kovan.vaultAddress);
          break;
        default:
          liquidPledging = new LiquidPledging(web3, networks.default.liquidPledgingAddress);
          liquidPledging.$vault = new Vault(web3, networks.default.vaultAddress);
          break;
      }

      return liquidPledging;
    });
};
