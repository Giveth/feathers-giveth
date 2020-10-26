const mongoose = require('mongoose');
require('mongoose-long')(mongoose);
require('../../src/models/mongoose-bn')(mongoose);
const DonationUsdValueUtility = require('./DonationUsdValueUtility');

const configFileName = 'beta'; // default or beta

// eslint-disable-next-line import/no-dynamic-require
const config = require(`../../config/${configFileName}.json`);

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
const ConversationRates = require('../../src/models/conversionRates.model')(app);

const donationUsdValueUtility = new DonationUsdValueUtility(ConversationRates, config);

const terminateScript = (message = '', code = 0) =>
  process.stdout.write(`Exit message: ${message}`, () => process.exit(code));

const main = async () => {
  return Donations.find({
    usdValue: 0,
    amount: { $ne: '0' },
  })
    .cursor()
    .eachAsync(
      async d => {
        const { usdValue, lessThanCutoff } = d;
        if (!lessThanCutoff) {
          await donationUsdValueUtility.setDonationUsdValue(d);
          if (usdValue !== d.usdValue) await d.save();
        }
      },
      {
        parallel: 50,
      },
    );
};

const mongoUrl = config.mongodb;
mongoose.connect(mongoUrl);

const db = mongoose.connection;
db.on('error', err => console.error('Could not connect to Mongo', err));
db.once('open', () => {
  console.log('Connected to Mongo');
  main().then(() => terminateScript('Finished', 0));
});
