import Web3 from 'web3';
import { LiquidPledging, LPVault } from 'liquidpledging';

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
    liquidPledgingAddress: '0x9a3e76a27e18994ebdb1ab813e87f4315d8faa5e',
    vaultAddress: '0x547626030c9e9df93657a38075339f429e7a998b',
  },
  rinkeby: {
    liquidPledgingAddress: '0x1B8F84E443668C81FeE5BEc266bc098e3c7fBC00',
    vaultAddress: '0xBf0bA4c72daab5BFeF6B9C496db91e4614a57131',
  },
  kovan: {
    liquidPledgingAddress: '0x0',
    vaultAddress: '0x0',
  },
  giveth: {
    liquidPledgingAddress: '0xc2E1c6cf5D18247d63618dABf58E14F058D02c7C',
    vaultAddress: '0x98bE0A726C9937Ba5E0227E84E1ccCaceFee88b4',
  },
  default: {
    liquidPledgingAddress: '0x5b1869D9A4C187F2EAa108f3062412ecf0526b24',
    vaultAddress: '0xe78A0F7E598Cc8b0Bb87894B0F60dD2a88d6a8Ab',
  },

};


const getLiquidPledging = web3 => web3.eth.net.getId()
  .then((id) => {
    let network;
    switch (id) {
      case 1:
        network = networks.main;
        break;
      case 2:
        network = networks.morden;
        break;
      case 3:
        network = networks.ropsten;
        break;
      case 4:
        network = networks.ropsten;
        break;
      case 33:
        network = networks.giveth;
        break;
      case 42:
        network = networks.kovan;
        break;
      default:
        network = networks.default;
        break;
    }

    const liquidPledging = new LiquidPledging(web3, network.liquidPledgingAddress);
    liquidPledging.$vault = new LPVault(web3, network.vaultAddress);

    return liquidPledging;
  });

const ONE_MINUTE = 60 * 1000;

export default function () {
  const app = this;
  const blockchain = app.get('blockchain');

  const web3 = new Web3(blockchain.nodeUrl);

  const opts = {
    startingBlock: blockchain.startingBlock,
  };

  let txMonitor;
  let lpMonitor;
  const init = () => {
    txMonitor = new FailedTxMonitor(web3, app);
    txMonitor.start();

    getLiquidPledging(web3)
      .then((liquidPledging) => {
        lpMonitor = new LiquidPledgingMonitor(app, liquidPledging, txMonitor, opts);
        lpMonitor.start();
      });
  };

  const reconnectOnEnd = () => {
    web3.currentProvider.on('end', (e) => {
      console.error(`connection closed reason: ${e.reason}, code: ${e.code}`);

      txMonitor.close();

      const intervalId = setInterval(() => {
        console.log('attempting to reconnect');

        const newProvider = new web3.providers.WebsocketProvider(blockchain.nodeUrl);

        newProvider.on('connect', () => {
          console.log('successfully connected');
          clearInterval(intervalId);
          web3.setProvider(newProvider);
          reconnectOnEnd();

          // TODO fix bug that prevents the following from working
          // lpMonitor.start will throw "connection not open on send()" for each subscribe
          // not sure of the cause, but it appears the the subscriptions are not updated
          // with the latest provider. https://github.com/ethereum/web3.js/issues/1188 may
          // be something to look into

          // txMonitor.start();
          // if (lpMonitor) {
          // web3.setProvider will clear any existing subscriptions, so we need to re-subscribe
          // lpMonitor.start();
          // }

          // using this instead of the above.
          init();
        });
      }, ONE_MINUTE);
    });
  };

  init();
  reconnectOnEnd();
}
