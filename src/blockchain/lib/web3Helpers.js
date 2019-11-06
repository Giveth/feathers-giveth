const Web3 = require('web3');
const logger = require('winston');
const EventEmitter = require('events');

const THIRTY_SECONDS = 30 * 1000;

/**
 * remove 0x prefix = require(hex string if present
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
  try {
    const batch = new web3.BatchRequest();
    requests.splice(0, 100).forEach(r => batch.add(r));
    batch.execute();
    batchAndExecuteRequests(web3, requests);
  } catch (e) {
    //  console.log(e); TODO: Add appropriate log
  }
}

/**
 * Executes all provided web3 requests in a single batch call
 *
 * Each request should be a bound object with all args excluding the callback:
 *
 * ex.
 *
 * web3.eth.getBalance.request.bind(null, '0x0000000000000000000000000000000000000000', 'latest')
 *
 * where as the request would typically be called like:
 *
 * web3.eth.getBalance.request('0x0000000000000000000000000000000000000000', 'latest', callback);
 *
 * The response is a Promise that will resolve to an array of request responses
 * in the same order as the provided requests array
 *
 * @param {object} web3 Web3 instance
 * @param {array} requests array of Web3 request objects
 * @returns Promise
 */
function executeRequestsAsBatch(web3, requests) {
  const batch = new web3.BatchRequest();

  const promise = Promise.all(
    requests.map(
      r =>
        new Promise((resolve, reject) => {
          batch.add(
            r((err, value) => {
              if (err) return reject(err);
              return resolve(value);
            }),
          );
        }),
    ),
  );

  batch.execute();

  return promise;
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

const blockCache = {};
const blockListeners = {};
/**
 * fetches the ts for the given blockNumber.
 *
 * caches the last 100 ts
 *
 * first checks if the ts is in the cache.
 * if it misses, we fetch the block using web3 and cache the result.
 *
 * if we are currently fetching a given block, we will not fetch it twice.
 * instead, we resolve the promise after we fetch the ts for the block.
 *
 * @param {number} blockNumber the blockNumber to fetch the ts of
 */
const getBlockTimestamp = async (web3, blockNumber) => {
  if (blockCache[blockNumber]) return blockCache[blockNumber];

  // if we are already fetching the block, don't do it twice
  if (blockListeners[blockNumber]) {
    return new Promise(resolve => {
      // attach a listener which is executed when we get the block ts
      blockListeners[blockNumber].push(resolve);
    });
  }

  blockListeners[blockNumber] = [];

  const block = await web3.eth.getBlock(blockNumber);
  const ts = new Date(block.timestamp * 1000);

  blockCache[blockNumber] = ts;

  // only keep 100 block ts cached
  if (Object.keys(blockCache).length > 100) {
    Object.keys(blockCache)
      .sort((a, b) => b - a)
      .forEach(key => delete blockCache[key]);
  }

  // execute any listeners for the block
  blockListeners[blockNumber].forEach(cb => cb(ts));
  delete blockListeners[blockNumber];

  return ts;
};

// if the websocket connection drops, attempt to re-connect
// upon successful re-connection, we re-start all listeners
const reconnectOnEnd = (web3Core, nodeUrl) => {
  const web3 = web3Core;
  web3.currentProvider.on('end', e => {
    if (web3.reconnectInterval) return;

    web3.emit(web3.DISCONNECT_EVENT);
    logger.error(`connection closed reason: ${e.reason}, code: ${e.code}`);

    web3.pingInterval = undefined;

    web3.reconnectInterval = setInterval(() => {
      logger.info('attempting to reconnect');

      const newProvider = new web3.providers.WebsocketProvider(nodeUrl);

      newProvider.on('connect', () => {
        logger.info('successfully connected');
        clearInterval(web3.reconnectInterval);
        web3.reconnectInterval = undefined;
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

function instantiateWeb3(nodeUrl) {
  const provider =
    nodeUrl && nodeUrl.startsWith('ws')
      ? new Web3.providers.WebsocketProvider(nodeUrl, {
          clientConfig: {
            maxReceivedFrameSize: 100000000,
            maxReceivedMessageSize: 100000000,
          },
        })
      : nodeUrl;
  const w3 = Object.assign(new Web3(provider), EventEmitter.prototype);

  if (w3.currentProvider.on) {
    w3.currentProvider.on('connect', () => {
      // keep geth node connection alive
      w3.pingInterval = setInterval(w3.eth.net.getId, 45 * 1000);
    });

    // attach the re-connection logic to the current web3 provider
    reconnectOnEnd(w3, nodeUrl);

    Object.assign(w3, {
      DISCONNECT_EVENT: 'disconnect',
      RECONNECT_EVENT: 'reconnect',
    });
  }

  return w3;
}

let web3;
let homeWeb3;
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

  web3 = instantiateWeb3(nodeUrl);
  return web3;
}

/**
 * returns the cached homeWeb3 instance or instantiates a new one.
 *
 * This web3 instance will emit the following events:
 *   - disconnect
 *   - reconnect
 * @param {object} app feathers application object
 */
function getHomeWeb3(app) {
  if (homeWeb3) return homeWeb3;

  const { homeNodeUrl } = app.get('blockchain');

  homeWeb3 = instantiateWeb3(homeNodeUrl);
  return homeWeb3;
}

const ANY_TOKEN = {
  name: 'ANY_TOKEN',
  address: '0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF',
  foreignAddress: '0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF',
  symbol: 'ANY_TOKEN',
  decimals: 18,
};

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

module.exports = {
  getWeb3,
  getHomeWeb3,
  batchAndExecuteRequests,
  executeRequestsAsBatch,
  removeHexPrefix,
  addAccountToWallet,
  getBlockTimestamp,
  ANY_TOKEN,
  ZERO_ADDRESS,
};
