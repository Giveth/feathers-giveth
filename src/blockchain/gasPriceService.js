const rp = require('request-promise');
const app = require('./../app');

// Fetching gasprice and making it available within feathers as app.gasPrice
// Usage within app: app.get('gasPrice')
// Returns a full json at the moment
const queryGasPrice = () => {
  console.log('fetching gas price from ethgasstation');
  return rp('https://ethgasstation.info/json/ethgasAPI.json')
    .then((resp) => app.set('gasPrice', JSON.parse(resp)))
    .catch((e) => console.error('could not fetch gas from ethgasstation', e));
};

// query gas price every minute
setInterval(() => {
  queryGasPrice();
}, 60000);

export default queryGasPrice;
