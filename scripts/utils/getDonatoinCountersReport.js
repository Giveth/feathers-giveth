/* eslint-disable no-console */
const mongoose = require('mongoose');
const web3 = require('web3');
const { ZERO_ADDRESS } = require('../../src/blockchain/lib/web3Helpers');
require('mongoose-long')(mongoose);
require('../../src/models/mongoose-bn')(mongoose);

const configFileName = 'beta'; // default or beta

const tokenWhiteList = ['SAI', 'DAI', 'ETH'];

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

const DACs = require('../../src/models/communities.model').createModel(app);
const Campaigns = require('../../src/models/campaigns.model').createModel(app);
const Milestones = require('../../src/models/traces.model').createModel(app);

const reportEntity = async (model, getEntityDescription) => {
  const cursor = model
    .find({
      'donationCounters.symbol': { $in: tokenWhiteList },
    })
    .cursor();

  return cursor.eachAsync(
    entity => {
      let hasMoney = false;
      let message = '';
      entity.donationCounters.forEach(dc => {
        const { symbol, currentBalance } = dc;
        if (currentBalance.toString() !== '0' && tokenWhiteList.includes(symbol)) {
          message += `${symbol}: ${web3.utils.fromWei(currentBalance)}\n`;
          hasMoney = true;
        }
      });
      if (hasMoney) {
        const entityDescription = getEntityDescription(entity);
        message += '------------------------------------';
        console.log(entityDescription + message);
      }
    },
    { parallel: 100 },
  );
};

const getUserDescription = (title, address) => `${title}: ${dappUrl}/profile/${address}\n`;

const getDacDescription = dac => {
  const { ownerAddress, _id, title } = dac;
  let message = `DAC Title: ${title}\n`;
  message += `Status: ${dac.status}\n`;
  message += `Link: ${dappUrl}/dacs/${_id.toString()}\n`;
  message += getUserDescription('Owner', ownerAddress);
  return message;
};

const getCampaignDescription = campaign => {
  const { ownerAddress, _id, reviewerAddress, title, coownerAddress } = campaign;
  let message = `Campaign Title: ${title}\n`;
  message += `Status: ${campaign.status}\n`;
  message += `Link: ${dappUrl}/campaigns/${_id.toString()}\n`;
  message += getUserDescription('Owner', ownerAddress);
  message += getUserDescription('Reviewer', reviewerAddress);
  if (coownerAddress) {
    message += getUserDescription('CoOwner', coownerAddress);
  }
  return message;
};

const getMilestoneDescription = milestone => {
  const { ownerAddress, _id, reviewerAddress, title, recipientAddress, campaignId } = milestone;
  let message = `Milestone Title: ${title}\n`;
  message += `Status: ${milestone.status}\n`;
  message += `Link: ${dappUrl}/campaigns/${campaignId}/milestones/${_id.toString()}\n`;
  message += getUserDescription('Owner', ownerAddress);
  if (reviewerAddress && reviewerAddress !== ZERO_ADDRESS) {
    message += getUserDescription('Reviewer', reviewerAddress);
  }
  if (recipientAddress && recipientAddress !== ZERO_ADDRESS) {
    message += getUserDescription('Recipient', recipientAddress);
  }
  return message;
};

// console.log('url:', mongoUrl);
mongoose.connect(mongoUrl);
const db = mongoose.connection;

db.on('error', err => console.error('Could not connect to Mongo', err));

// once mongo connected, start migration
db.once('open', async () => {
  console.log('Connected to Mongo');
  console.log('\n\n');

  console.log('##############################');
  console.log('REPORTING COMMUNITY\n');
  await reportEntity(DACs, getDacDescription);

  console.log('##############################');
  console.log('REPORTING CAMPAIGN\n');
  await reportEntity(Campaigns, getCampaignDescription);

  console.log('##############################');
  console.log('REPORTING MILESTONE\n');
  await reportEntity(Milestones, getMilestoneDescription);
  process.exit(0);
});
