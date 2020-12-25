/**
 * remove 0x prefix = require(hex string if present
 *
 * @param {string} hex
 */
import { transactionModel } from '../models/transactions.model';
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export const removeHexPrefix = hex => {
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
export function batchAndExecuteRequests(web3, requests) {
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
export function executeRequestsAsBatch(web3, requests) {
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
export const getBlockTimestamp = async (web3, blockNumber) => {
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
      // @ts-ignore
      .sort((a, b) => b - a)
      .forEach(key => delete blockCache[key]);
  }

  // execute any listeners for the block
  blockListeners[blockNumber].forEach(cb => cb(ts));
  delete blockListeners[blockNumber];

  return ts;
};

export const getTransaction = async (web3:any ,hash:string) => {
  const transaction = await web3.eth.getTransaction(hash);
  return transaction;
};

export const ANY_TOKEN = {
  name: 'ANY_TOKEN',
  address: '0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF',
  foreignAddress: '0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF',
  symbol: 'ANY_TOKEN',
  decimals: 18,
};
