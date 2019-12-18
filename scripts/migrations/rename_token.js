const mongoose = require('mongoose');
require('mongoose-long')(mongoose);
require('../../src/models/mongoose-bn')(mongoose);

// development database
const mongoUrl = 'mongodb://localhost:27017/giveth';
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

const Conversations = require('../../src/models/conversations.model')(app);
const Campaign = require('../../src/models/campaigns.model').createModel(app);

const migrateConversations = () => {
  const cursor = Conversations.find({
    messageContext: 'payment',
    'payments.symbol': tokenCurrentSymbol,
  }).cursor();

  return cursor.eachAsync(doc => {
    const index = doc.payments.findIndex(p => p.symbol === tokenCurrentSymbol);
    // eslint-disable-next-line no-param-reassign
    doc.payments[index].symbol = tokenNewSymbol;
    return Conversations.update({ _id: doc._id }, doc).exec();
  });
};

const migrateCampaigns = () => {
  const cursor = Campaign.find({
    'donationCounters.symbol': tokenCurrentSymbol,
  }).cursor();

  return cursor.eachAsync(doc => {
    const index = doc.donationCounters.findIndex(p => p.symbol === tokenCurrentSymbol);
    // eslint-disable-next-line no-param-reassign
    doc.donationCounters[index].name = tokenNewSymbol;
    doc.donationCounters[index].symbol = tokenNewSymbol;
    return Campaign.update({ _id: doc._id }, doc).exec();
  });
};

mongoose.connect(mongoUrl);
const db = mongoose.connection;

db.on('error', err => console.error('Could not connect to Mongo', err));

// once mongo connected, start migration
db.once('open', () => {
  console.log('Connected to Mongo');

  Promise.all([migrateConversations(), migrateCampaigns()]).then(() => process.exit());
});
