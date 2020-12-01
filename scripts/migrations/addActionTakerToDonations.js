/* eslint-disable no-console */
const mongoose = require('mongoose');
const Web3 = require('web3');
require('mongoose-long')(mongoose);
require('../../src/models/mongoose-bn')(mongoose);

const configFileName = 'default'; // default or beta

// eslint-disable-next-line import/no-dynamic-require
const config = require(`../../config/${configFileName}.json`);

const { nodeUrl, homeNodeUrl } = config.blockchain;

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

const Donations = require('../../src/models/donations.model').createModel(app);

// Instantiate Web3 module
// @params {string} url blockchain node url address
const instantiateWeb3 = url => {
  const provider =
    url && url.startsWith('ws')
      ? new Web3.providers.WebsocketProvider(url, {
          clientConfig: {
            maxReceivedFrameSize: 100000000,
            maxReceivedMessageSize: 100000000,
          },
        })
      : url;
  return new Web3(provider);
};

const addMissedDonations = async () => {
  const txHashes = await Donations.distinct('txHash', {
    actionTakerAddress: { $exists: false },
    homeTxHash: { $exists: false },
  });

  if (txHashes.length === 0) return;

  const foreignWeb3 = instantiateWeb3(nodeUrl);

  const batch = new foreignWeb3.BatchRequest();
  const promises = txHashes.map(txHash => {
    return new Promise((resolve, reject) => {
      batch.add(
        foreignWeb3.eth.getTransaction.request(txHash, (err, tx) => {
          if (err) {
            reject(err);
          } else {
            resolve(tx);
          }
        }),
      );
    });
  });
  batch.execute();

  await Promise.all(
    promises.map(async promise => {
      const tx = await promise;
      if (tx) {
        const { hash, from } = tx;
        console.log(
          `Update actionTakerAddress of donation with txHash ${hash} to:\n${from}\n-----------`,
        );
        await Donations.update(
          { txHash: hash },
          {
            $set: {
              actionTakerAddress: from,
            },
          },
          {
            multi: true,
          },
        );
      }
    }),
  );
};

const addToDirectDonations = async () => {
  const txHashes = await Donations.distinct('homeTxHash', {
    homeTxHash: { $exists: true },
  });

  if (txHashes.length === 0) return;

  const homeWeb3 = instantiateWeb3(homeNodeUrl);

  const batch = new homeWeb3.BatchRequest();
  const promises = txHashes.map(txHash => {
    return new Promise((resolve, reject) => {
      batch.add(
        homeWeb3.eth.getTransaction.request(txHash, (err, tx) => {
          if (err) {
            reject(err);
          } else {
            resolve(tx);
          }
        }),
      );
    });
  });
  batch.execute();

  await Promise.all(
    promises.map(async promise => {
      const tx = await promise;
      if (tx) {
        const { hash, from } = tx;
        console.log(
          `Update actionTakerAddress of donation with txHash ${hash} to:\n${from}\n-----------`,
        );

        const { txHash } = await Donations.findOne({ homeTxHash: hash });
        await Donations.update(
          { txHash },
          {
            $set: {
              actionTakerAddress: from,
            },
          },
          {
            multi: true,
          },
        );
      }
    }),
  );
};

const mongoUrl = config.mongodb;
console.log('url:', mongoUrl);
mongoose.connect(mongoUrl);
const db = mongoose.connection;

db.on('error', err => console.error('Could not connect to Mongo', err));

// once mongo connected, start migration
db.once('open', () => {
  console.log('Connected to Mongo');
  Promise.all([addMissedDonations(), addToDirectDonations()]).then(() => {
    return process.exit();
  });
});
