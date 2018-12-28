const logger = require('winston');
const balanceMonitor = require('./balanceMonitor');
const failedTxMonitor = require('./failedTxMonitor');
const pledgeNormalizer = require('./normalizer');
const eventWatcher = require('./watcher');
const eventHandler = require('./lib/eventHandler');
const { getWeb3, getHomeWeb3 } = require('./lib/web3Helpers');

let { START_WATCHERS = true } = process.env;
if (typeof START_WATCHERS === 'string' && START_WATCHERS.toLowerCase() === 'false') {
  START_WATCHERS = false;
}

module.exports = function init() {
  const app = this;

  const web3 = getWeb3(app);
  app.getWeb3 = getWeb3.bind(null, app);
  app.getHomeWeb3 = getHomeWeb3.bind(null, app);

  if (!START_WATCHERS) return;

  logger.info('starting blockchain watchers');

  // initialize the event listeners
  const handler = eventHandler(app);

  const balMonitor = balanceMonitor(app);
  balMonitor.start();

  const normalizer = pledgeNormalizer(app);
  normalizer.start();

  const watcher = eventWatcher(app, handler);
  watcher.start();

  const txMonitor = failedTxMonitor(app, watcher);
  txMonitor.start();

  web3.on(web3.DISCONNECT_EVENT, () => {
    txMonitor.close();
    watcher.close();
  });

  web3.on(web3.RECONNECT_EVENT, () => {
    // web3.setProvider will clear any existing subscriptions, so we need to re-subscribe
    txMonitor.start();
    watcher.start();
  });
};
