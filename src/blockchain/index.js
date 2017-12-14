import Web3 from 'web3';
import logger from 'winston';

import LiquidPledgingMonitor from './LiquidPledgingMonitor';
import FailedTxMonitor from './FailedTxMonitor';
import getNetwork from "./getNetwork";

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

  // initialize the event listeners
  const init = () => {
    txMonitor = new FailedTxMonitor(web3, app);
    txMonitor.start();

    getNetwork(web3).then((network) => {
      lpMonitor = new LiquidPledgingMonitor(app, web3, network, txMonitor, opts);
      lpMonitor.start();
    })

  };

  // if the websocket connection drops, attempt to re-connect
  // upon successful re-connection, we re-start all listeners
  const reconnectOnEnd = () => {
    web3.currentProvider.on('end', (e) => {
      logger.error(`connection closed reason: ${e.reason}, code: ${e.code}`);

      txMonitor.close();

      const intervalId = setInterval(() => {
        logger.info('attempting to reconnect');

        const newProvider = new web3.providers.WebsocketProvider(blockchain.nodeUrl);

        newProvider.on('connect', () => {
          logger.info('successfully connected');
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

  // attach the re-connection logic to the current web3 provider
  reconnectOnEnd();
}
