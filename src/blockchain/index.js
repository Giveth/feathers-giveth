const balanceMonitor = require('./balanceMonitor');
const failedTxMonitor = require('./failedTxMonitor');
const eventWatcher = require('./watcher');
const eventHandler = require('./lib/eventHandler');
const { getWeb3 } = require('./lib/web3Helpers');

export default function() {
  const app = this;

  const web3 = getWeb3(app);
  app.getWeb3 = getWeb3.bind(null, app);

  // initialize the event listeners
  const handler = eventHandler(app);

  const balMonitor = balanceMonitor(app);
  balMonitor.start();

  const txMonitor = failedTxMonitor(app, eventHandler);
  // txMonitor.start();

  const watcher = eventWatcher(app, handler);
  watcher.start();

  web3.on(web3.DISCONNECT_EVENT, () => {
    txMonitor.close();
    watcher.close();
  });

  web3.on(web3.RECONNECT_EVENT, () => {
    // web3.setProvider will clear any existing subscriptions, so we need to re-subscribe
    txMonitor.start();
    watcher.start();
  });
}
