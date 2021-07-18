/* eslint-disable no-console */
/**
 * This script populate and updates entities dependent to token decimals
 * Entities include Donation, Milestone, Campaign, DACs and Conversations
 */
const mongoose = require('mongoose');
require('mongoose-long')(mongoose);
require('../../src/models/mongoose-bn')(mongoose);
const { toBN } = require('web3-utils');

const config = require('../../config/beta.json');

const { tokenWhitelist } = config;

const symbolDecimalsMap = {};

tokenWhitelist.forEach(({ symbol, decimals }) => {
  symbolDecimalsMap[symbol] = {
    decimals,
    cutoff: toBN(10 ** (18 - Number(decimals))),
  };
});

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
const DACs = require('../../src/models/communities.model').createModel(app);
const Campaigns = require('../../src/models/campaigns.model').createModel(app);
const Milestones = require('../../src/models/traces.model').createModel(app);
const Conversations = require('../../src/models/conversations.model')(app);

const populateEntityToken = model => {
  return Promise.all(
    tokenWhitelist.map(token =>
      model.update(
        { 'token.name': token.name },
        {
          $set: {
            'token.decimals': token.decimals,
          },
        },
        {
          multi: true,
        },
      ),
    ),
  );
};

const populateEntityDonationCounter = model => {
  return model
    .find({})
    .cursor()
    .eachAsync(
      entity => {
        const { _id, donationCounters } = entity;
        donationCounters.forEach(dc => {
          dc.decimals = symbolDecimalsMap[dc.symbol].decimals;
        });
        return model.update({ _id }, { donationCounters }).exec();
      },
      {
        parallel: 30,
      },
    );
};

const updateLessThanCutoff = () => {
  return Donations.find({})
    .cursor()
    .eachAsync(
      async donation => {
        const { _id, token, amountRemaining } = donation;
        const { cutoff } = symbolDecimalsMap[token.symbol];
        const lessThanCutoff = amountRemaining.lt(cutoff);
        await Donations.update(
          { _id },
          {
            $set: {
              lessThanCutoff,
            },
          },
        ).exec();
      },
      {
        parallel: 200,
      },
    );
};

const updatePaymentConversations = () => {
  return Conversations.find({ messageContext: 'payment' })
    .cursor()
    .eachAsync(
      ({ _id, payments }) => {
        payments.forEach(p => {
          p.tokenDecimals = symbolDecimalsMap[p.symbol].decimals;
        });
        return Conversations.update({ _id }, { payments }).exec();
      },
      {
        parallel: 100,
      },
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

  Promise.all([
    populateEntityToken(Donations),
    populateEntityToken(Milestones),
    populateEntityDonationCounter(DACs),
    populateEntityDonationCounter(Campaigns),
    populateEntityDonationCounter(Milestones),
    updateLessThanCutoff(),
    updatePaymentConversations(),
  ]).then(() => process.exit());
});
