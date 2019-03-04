const mongoose = require('mongoose');

/**
 * NOTE: Make sure to point this to the correct config!
 * */
const config = require('../../config/default.json');

const mongoUrl = config.mongodb;
mongoose.connect(mongoUrl);
const db = mongoose.connection;

db.on('error', err => console.error('migrateMultipleMilestones > Could not connect to Mongo', err));

// once mongo connected, start migration
db.once('open', async () => {
  console.log('Connected to Mongo');

  try {
    await db.collection('milestones').updateMany(
      {},
      {
        $set: {
          type: 'LPPCappedMilestone',
        },
      },
    );
    console.log('done');
  } catch (e) {
    console.error(e);
  }
  process.exit();
});
