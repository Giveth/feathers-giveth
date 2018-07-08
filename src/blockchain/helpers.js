import Web3PromiEvent from 'web3-core-promievent';
import logger from 'winston';
import { MiniMeToken } from 'minimetoken';
import NonceTracker from './NonceTracker';
import { getWeb3 } from './web3Helpers';

export const milestoneStatus = (completed, canceled) => {
  if (canceled) return 'Canceled';
  if (completed) return 'Completed';
  return 'InProgress';
};

export const pledgeState = val => {
  switch (val) {
    case '0':
      return 'Pledged';
    case '1':
      return 'Paying';
    case '2':
      return 'Paid';
    default:
      return 'Unknown';
  }
};

export const getTokenInformation = (web3, addr) => {
  const minime = new MiniMeToken(web3, addr);

  return Promise.all([minime.name(), minime.symbol()]).then(([name, symbol]) => ({
    name,
    symbol,
    address: addr,
  }));
};

const nonceCache = {};
export const lockNonceAndSendTransaction = (web3, txFn, opts, ...args) => {
  const { from } = opts;

  if (!from) throw new Error('Missing from in opts');

  if (!nonceCache[from]) {
    nonceCache[from] = new NonceTracker();
    const initTracker = () =>
      web3.eth
        .getTransactionCount(from, 'pending')
        .then(nonce => {
          nonceCache[from].initialize(nonce);
        })
        .catch(e => {
          logger.debug('Failed to initialize NonceTracker. Trying again.', e);
          setTimeout(initTracker, 5000);
        });

    initTracker();
  }

  // we need to create a new PromiEvent here b/c fetchNonce returns a regular promise
  // however on a 'deploy' we want to return a PromiEvent
  const defer = new Web3PromiEvent();
  const relayEvent = event => (...params) => defer.eventEmitter.emit(event, ...params);

  let txHash;
  nonceCache[from].obtainNonce().then(nonce => {
    opts.nonce = nonce;
    return txFn(...args, opts)
      .on('transactionHash', tHash => {
        txHash = tHash;
        nonceCache[from].releaseNonce(nonce, true);
        relayEvent('transactionHash')(tHash);
      })
      .on('confirmation', relayEvent('confirmation'))
      .on('receipt', relayEvent('receipt'))
      .on('error', e => {
        if (!txHash) nonceCache[from].releaseNonce(nonce, false);
        relayEvent('error')(e);
      });
  });

  return defer.eventEmitter;
};

/**
 * Send funds to an account if the currentBal is <
 * the configured `walletMinBalane`
 *
 * @param {object} app feathers app instance
 * @param {string} address address to fund
 * @param {string} currentBal current balance of the address
 */
export function fundAccountIfLow(app, address, currentBal) {
  const web3 = getWeb3(app);
  const { toBN } = web3.utils;

  const { walletMinBalance, walletSeedAmount } = app.get('blockchain');

  // fund wallet if the bal is < minBal
  if (toBN(currentBal).lt(toBN(walletMinBalance))) {
    lockNonceAndSendTransaction(web3, web3.eth.sendTransaction, {
      from: web3.eth.accounts.wallet[0].address,
      to: address,
      value: walletSeedAmount,
      gas: 21000,
    }).on('transactionHash', txHash => {
      app.service('users').patch(address, {
        lastFunded: new Date(),
        fundingTxHash: txHash,
      });
    });
  }
}
