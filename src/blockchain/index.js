import Web3 from 'web3';
import { LiquidPledging, Vault } from 'liquidpledging';

import LiquidPledgingMonitor from './LiquidPledgingMonitor';
import FailedTxMonitor from './FailedTxMonitor';

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
    liquidPledgingAddress: '0x18658A1A7cB8b0Be97b155D051769b3651b2943c',
    vaultAddress: '0x92b77D5Fb946e63404967C04f9023db77EC66832',
  },
  rinkeby: {
    liquidPledgingAddress: '0x0',
    vaultAddress: '0x0',
  },
  kovan: {
    liquidPledgingAddress: '0x0',
    vaultAddress: '0x0',
  },
  giveth: {
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

  web3.currentProvider.connection.onerror = (e) => console.error('connection error ->', e);
  web3.currentProvider.connection.onclose = (e) => console.error('connection closed ->', e);

  const init = () => {
    const txMonitor = new FailedTxMonitor(web3, app);
    txMonitor.start();

    getLiquidPledging(web3)
      .then(liquidPledging => {
        const lpMonitor = new LiquidPledgingMonitor(app, liquidPledging, txMonitor, opts);
        lpMonitor.start();
      });
  };

  init();
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
        case 33:
          liquidPledging = new LiquidPledging(web3, networks.giveth.liquidPledgingAddress);
          liquidPledging.$vault = new Vault(web3, networks.giveth.vaultAddress);
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
