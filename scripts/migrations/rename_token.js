/* eslint-disable no-console */
const mongoose = require('mongoose');
require('mongoose-long')(mongoose);
require('../../src/models/mongoose-bn')(mongoose);

const config = require('../../config/default.json');

const tokenCurrentSymbol = 'DAI';
const tokenNewSymbol = 'SAI';

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
const Conversations = require('../../src/models/conversations.model')(app);
const ConversionRates = require('../../src/models/conversionRates.model')(app);

const migrateCampaigns = () => {
  const cursor = Campaigns.find({
    'donationCounters.symbol': tokenCurrentSymbol,
  }).cursor();

  return cursor.eachAsync(doc => {
    const index = doc.donationCounters.findIndex(p => p.symbol === tokenCurrentSymbol);
    const setObj = {};

    setObj[`donationCounters.${index}.name`] = tokenNewSymbol;
    setObj[`donationCounters.${index}.symbol`] = tokenNewSymbol;

    return Campaigns.update(
      { _id: doc._id },
      {
        $set: {
          ...setObj,
        },
      },
    ).exec();
  });
};

const migrateConversations = () => {
  const cursor = Conversations.find({
    messageContext: 'payment',
    'payments.symbol': tokenCurrentSymbol,
  }).cursor();

  return cursor.eachAsync(doc => {
    const index = doc.payments.findIndex(p => p.symbol === tokenCurrentSymbol);
    const setObj = {};

    setObj[`payments.${index}.symbol`] = tokenNewSymbol;

    return Conversations.update(
      { _id: doc._id },
      {
        $set: {
          ...setObj,
        },
      },
    ).exec();
  });
};

const migrateConversionRates = () => {
  const ratesQueryObj = {};
  ratesQueryObj[`rates.${tokenCurrentSymbol}`] = { $exists: true };

  const cursor = ConversionRates.find({
    $or: [
      {
        symbol: tokenCurrentSymbol,
      },
      {
        ...ratesQueryObj,
      },
    ],
  }).cursor();

  return cursor.eachAsync(doc => {
    const updateObj = {};
    const setObj = {};
    const unsetObj = {};

    if (doc.symbol === tokenCurrentSymbol) {
      setObj.symbol = tokenNewSymbol;
    }

    const rateValue = doc.rates[tokenCurrentSymbol];
    // token exists in rates
    if (rateValue) {
      setObj[`rates.${tokenNewSymbol}`] = rateValue;
      unsetObj[`rates.${tokenCurrentSymbol}`] = '';

      updateObj.$unset = {
        ...unsetObj,
      };
    }

    updateObj.$set = {
      ...setObj,
    };

    return ConversionRates.update({ _id: doc._id }, { ...updateObj }).exec();
  });
};

const mongoUrl = config.mongodb;
console.log('url:', mongoUrl);
mongoose.connect(mongoUrl);
const db = mongoose.connection;

db.on('error', err => console.error('Could not connect to Mongo', err));

// once mongo connected, start migration
db.once('open', () => {
  console.log('Connected to Mongo');

  Promise.all([migrateCampaigns(), migrateConversations(), migrateConversionRates()]).then(() =>
    process.exit(),
  );
});
