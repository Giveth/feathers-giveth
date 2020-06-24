/* eslint-disable no-console */
const mongoose = require('mongoose');
require('mongoose-long')(mongoose);
require('../../src/models/mongoose-bn')(mongoose);
const Web3 = require('web3');

const { getBlockTimestamp } = require('../../src/blockchain/lib/web3Helpers');

const configFileName = 'default'; // default or beta

// eslint-disable-next-line import/no-dynamic-require
const config = require(`../../config/${configFileName}.json`);

const { nodeUrl } = config.blockchain;

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

const Milestones = require('../../src/models/milestones.model').createModel(app);
const Events = require('../../src/models/events.model').createModel(app);

const { EventStatus } = require('../../src/models/events.model');

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

const mongoUrl = config.mongodb;
console.log('url:', mongoUrl);
mongoose.connect(mongoUrl);
const db = mongoose.connection;

db.on('error', err => console.error('Could not connect to Mongo', err));

// once mongo connected, start migration
db.once('open', async () => {
  console.log('Connected to Mongo');
  const web3 = await instantiateWeb3(nodeUrl);
  Events.find({ event: 'ProjectAdded', status: EventStatus.PROCESSED })
    .select(['blockNumber', 'returnValues'])
    .cursor()
    .eachAsync(
      async event => {
        const { blockNumber, returnValues } = event;
        const { idProject } = returnValues;
        const date = await getBlockTimestamp(web3, blockNumber);
        await Milestones.updateOne(
          { projectId: idProject },
          {
            $set: {
              projectAddedAt: date,
            },
          },
        ).exec();
      },
      {
        parallel: 40,
      },
    )
    .then(() => process.exit());
});
