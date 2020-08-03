const mongoose = require('mongoose');
const https = require('https');
require('mongoose-long')(mongoose);
require('../../src/models/mongoose-bn')(mongoose);

const configFileName = 'beta'; // default or beta

// eslint-disable-next-line import/no-dynamic-require
const config = require(`../../config/${configFileName}.json`);
const mongoUrl = config.mongodb;
const { dappUrl } = config;

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

const Campaigns = require('../../src/models/campaigns.model').createModel(app);
const { CampaignStatus } = require('../../src/models/campaigns.model');

// console.log('url:', mongoUrl);
mongoose.connect(mongoUrl);
const db = mongoose.connection;

db.on('error', err => console.error('Could not connect to Mongo', err));

// once mongo connected, start migration
db.once('open', async () => {
  Campaigns.find({
    status: CampaignStatus.ACTIVE,
  })
    .cursor()
    .eachAsync(
      campaign => {
        return new Promise(resolve => {
          const id = campaign._id.toString();
          https.get(`${dappUrl}/campaigncsv/${id}`, resp => {
            resp.on('data', () => {});
            resp.on('end', () => {
              console.log(`${id} is finished`);
              resolve();
            });
          });
        });
      },
      {
        parallel: 10,
      },
    )
    .then(() => process.exit(0));
});
