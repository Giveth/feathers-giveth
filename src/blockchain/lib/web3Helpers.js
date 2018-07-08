import Web3 from 'web3';
import logger from 'winston';
import EventEmitter from 'events';

const THIRTY_SECONDS = 30 * 1000;

/**
 * remove 0x prefix from hex string if present
 *
 * @param {string} hex
 */
const removeHexPrefix = hex => {
  if (hex && typeof hex === 'string' && hex.toLowerCase().startsWith('0x')) {
    return hex.substring(2);
  }
  return hex;
};

/**
 * recursively execute all requests in batches of 100
 *
 * @param {object} web3 Web3 instance
 * @param {array} requests array of Web3 request objects
 */
function batchAndExecuteRequests(web3, requests) {
  if (requests.length === 0) return;
  const batch = new web3.BatchRequest();
  requests.splice(0, 100).forEach(r => batch.add(r));
  batch.execute();

  batchAndExecuteRequests(web3, requests);
}

/**
 * Adds an account to the wallet of the provided web3 instance
 * if it has not be previously added
 *
 * @param {object} web3 Web3 instance
 * @param {string} privateKey pk of the account to add to the wallet
 * @returns {object} web3 account instance
 */
const addAccountToWallet = (web3, privateKey) => {
  let account = [].find.call(web3.eth.accounts.wallet, a => a.privateKey === privateKey);

  if (account) return account;

  if (web3.eth.accounts.wallet.length === 0 && privateKey) {
    account = web3.eth.accounts.privateKeyToAccount(privateKey);
    web3.eth.accounts.wallet.add(account);
  }

  return account;
};

// if the websocket connection drops, attempt to re-connect
// upon successful re-connection, we re-start all listeners
const reconnectOnEnd = (web3, nodeUrl) => {
  web3.currentProvider.on('end', e => {
    web3.emit(web3.DISCONNECT_EVENT);
    logger.error(`connection closed reason: ${e.reason}, code: ${e.code}`);

    const intervalId = setInterval(() => {
      logger.info('attempting to reconnect');

      const newProvider = new web3.providers.WebsocketProvider(nodeUrl);

      newProvider.on('connect', () => {
        logger.info('successfully connected');
        clearInterval(intervalId);
        // note: "connection not open on send()" will appear in the logs when setProvider is called
        // This is because web3.setProvider will attempt to clear any subscriptions on the currentProvider
        // before setting the newProvider. Our currentProvider has been disconnected, so thus the not open
        // error is logged
        web3.setProvider(newProvider);
        // attach reconnection logic to newProvider
        reconnectOnEnd(web3, nodeUrl);
        web3.emit(web3.RECONNECT_EVENT);
      });
    }, THIRTY_SECONDS);
  });
};

let web3;
/**
 * returns the cached web3 instance or instantiates a new one.
 *
 * This web3 instance will emit the following events:
 *   - disconnect
 *   - reconnect
 * @param {object} app feathers application object
 */
function getWeb3(app) {
  if (web3) return web3;

  const { nodeUrl } = app.get('blockchain');

  web3 = Object.assign(new Web3(nodeUrl), EventEmitter.prototype);

  web3.currentProvider.on('connect', () => {
    // keep geth node connection alive
    setInterval(web3.eth.net.getId, 45 * 1000);
  });

  // attach the re-connection logic to the current web3 provider
  reconnectOnEnd(web3, nodeUrl);

  Object.assign(web3, {
    DISCONNECT_EVENT: 'disconnect',
    RECONNECT_EVENT: 'reconnect',
  });

  return web3;
}

module.exports = {
  getWeb3,
  batchAndExecuteRequests,
  removeHexPrefix,
  addAccountToWallet,
};
