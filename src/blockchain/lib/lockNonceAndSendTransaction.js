const Web3PromiEvent = require('web3-core-promievent');
const logger = require('winston');
const NonceTracker = require('../NonceTracker');

const nonceCache = {};

/**
 * Acquires a nonce for the `from` account specified in the opts and
 * executes the provided `txFn` with the acquired nonce. This ensures
 * that nonces are not overwritten when broadcasting multiple txs in
 * quick succession.
 *
 * @param {object} web3 Web3 instance
 * @param {object} txFn func that sends a tx after we obtain a nonce
 * @param {object} opts options to pass to the txFn
 * @param {*} args any args to pass to the txFn
 */
module.exports = function lockNonceAndSendTransaction(web3, txFn, opts, ...args) {
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
    const options = Object.assign(opts, { nonce });
    return txFn(...args, options)
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
