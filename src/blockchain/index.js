import Web3 from 'web3';
import liquidpledging from 'liquidpledging';

import LiquidPledgingMonitor from './LiquidPledgingMonitor';

const LiquidPledging = liquidpledging.LiquidPledging(false);

const networks = {
  main: '0x0',
  morden: '0x0',
  ropsten: '0x0',
  rinkeby: '0x0',
  kovan: '0x0',
  default: '0x5b1869D9A4C187F2EAa108f3062412ecf0526b24',
};

export default function () {
  const app = this;
  const blockchain = app.get('blockchain');

  const web3 = new Web3(blockchain.nodeUrl);

  const opts = {
    startingBlock: blockchain.startingBlock
  };

  getLiquidPledging(web3)
    .then(liquidPledging => {
      const managerMonitor = new LiquidPledgingMonitor(app, liquidPledging, opts);
      managerMonitor.start();
    });
}

const getLiquidPledging = (web3) => {
  return web3.eth.net.getId()
    .then(id => {
      let liquidPledging;
      switch (id) {
        case 1:
          liquidPledging = new LiquidPledging(web3, networks.main);
          break;
        case 2:
          liquidPledging = new LiquidPledging(web3, networks.morden);
          break;
        case 3:
          liquidPledging = new LiquidPledging(web3, networks.ropsten);
          break;
        case 4:
          liquidPledging = new LiquidPledging(web3, networks.rinkeby);
          break;
        case 42:
          liquidPledging = new LiquidPledging(web3, networks.kovan);
          break;
        default:
          liquidPledging = new LiquidPledging(web3, networks.default);
          break;
      }

      return liquidPledging;
    });
};
