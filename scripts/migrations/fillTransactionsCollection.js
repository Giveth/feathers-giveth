/* eslint-disable no-console */
const mongoose = require('mongoose');

const config = require(`config`);

require('mongoose-long')(mongoose);
require('../../src/models/mongoose-bn')(mongoose);
const { getTransaction, getWeb3, getHomeWeb3 } = require('../../src/blockchain/lib/web3Helpers');

const appFactory = () => {
  const data = {};
  return {
    get(key) {
      return data[key];
    },
    set(key, val) {
      data[key] = val;
    },
  };
};

const app = appFactory();
app.set('mongooseClient', mongoose);
app.getWeb3 = getWeb3.bind(null, app);
app.getHomeWeb3 = getHomeWeb3.bind(null, app);
app.set('blockchain', config.get('blockchain'));
const Events = require('../../src/models/events.model').createModel(app);
const Donations = require('../../src/models/donations.model').createModel(app);
const Transactions = require('../../src/models/transactions.model').createModel(app);

app.set('transactionsModel', Transactions);

const mongoUrl = config.mongodb;
console.log('url:', mongoUrl);
mongoose.connect(mongoUrl);
const db = mongoose.connection;

const handleEvents = async () => {
  await Events.find({})
    .cursor()
    .eachAsync(
      async ({ transactionHash }) => {
        try {
          await getTransaction(app, transactionHash);
        } catch (e) {
          console.log('getTransaction for event error');
        }
      },
      {
        parallel: 50,
      },
    );
  await Donations.find({})
    .cursor()
    .eachAsync(
      async ({ txHash, homeTxHash }) => {
        try {
          if (txHash) {
            await getTransaction(app, txHash);
          }
          if (homeTxHash) {
            // console.log('Getting donation transaction homeTxHash before');
            await getTransaction(app, homeTxHash, true);
            // console.log('Getting donation transaction homeTxHash after');
          }
        } catch (e) {
          console.log('getTransaction for donations error', e);
        }
      },
      {
        parallel: 50,
      },
    );
};

db.on('error', err => console.error('Could not connect to Mongo', err));

// once mongo connected, start migration
db.once('open', () => {
  console.log('Connected to Mongo');
  handleEvents();
});
