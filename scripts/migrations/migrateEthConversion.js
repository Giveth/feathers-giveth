const mongoose = require('mongoose');

/**
 * NOTE: Make sure to point this to the correct config!
 * */
const config = require('../../config/default.json');

const mongoUrl = config.mongodb;
mongoose.connect(mongoUrl);
const db = mongoose.connection;

db.on('error', err => console.error('migrateToTokens > Could not connect to Mongo', err));

// once mongo connected, start migration
db.once('open', async () => {
  console.log('Connected to Mongo');

  try {
    db.collection('ethconversions').rename('conversionRates');

    const Milestones = db.collection('milestones');
    const Conversations = db.collection('conversations');

    await Milestones.updateMany(
      {},
      {
        $rename: {
          ethConversionRateTimestamp: 'conversionRateTimestamp',
        },
      },
    );

    await new Promise(resolve =>
      Milestones.find({ 'items.ethConversionRateTimestamp': { $exists: true } }).toArray(
        async (err, milestones) => {
          await Promise.all(
            milestones.map(m =>
              Milestones.updateOne(
                { _id: m._id },
                {
                  $set: {
                    items: m.items.map(i => {
                      i.conversionRateTimestamp = i.ethConversionRateTimestamp;
                      delete i.ethConversionRateTimestamp;
                      return i;
                    }),
                  },
                },
              ),
            ),
          );
          resolve();
        },
      ),
    );

    await new Promise(resolve =>
      Milestones.find({ 'proofItems.ethConversionRateTimestamp': { $exists: true } }).toArray(
        async (err, milestones) => {
          await Promise.all(
            milestones.map(m =>
              Milestones.updateOne(
                { _id: m._id },
                {
                  $set: {
                    proofItems: m.proofItems.map(i => {
                      i.conversionRateTimestamp = i.ethConversionRateTimestamp;
                      delete i.ethConversionRateTimestamp;
                      return i;
                    }),
                  },
                },
              ),
            ),
          );
          resolve();
        },
      ),
    );

    await new Promise(resolve =>
      Conversations.find({ 'items.ethConversionRateTimestamp': { $exists: true } }).toArray(
        async (err, conversations) => {
          await Promise.all(
            conversations.map(c =>
              Conversations.updateOne(
                { _id: c._id },
                {
                  $set: {
                    items: c.items.map(i => {
                      i.conversionRateTimestamp = i.ethConversionRateTimestamp;
                      delete i.ethConversionRateTimestamp;
                      return i;
                    }),
                  },
                },
              ),
            ),
          );
          resolve();
        },
      ),
    );
    console.log('done');
  } catch (e) {
    console.error(e);
  }
  process.exit();
});
