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
// const Campaign = require('../../src/models/campaigns.model').createModel(app);

//
/**
 * Lets get the party started!
 # Connect to Mongo and start migrations
 */
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

mongoose.connect(mongoUrl);
const db = mongoose.connection;

db.on('error', err => console.error('Could not connect to Mongo', err));

// once mongo connected, start migration
db.once('open', () => {
  console.log('Connected to Mongo');

  Promise.all([migrateConversations()]).then(() => process.exit());
});
