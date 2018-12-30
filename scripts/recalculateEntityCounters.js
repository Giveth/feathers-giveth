/**
 * NOTE: make sure to chage the dappmailer url in config/*.json to an invalid url
 * to prevent sending duplicate email notifications
 * 
 * to run:
 *
 * NODE_ENV=production node scripts/recalculateEntityCounters.js
 *
 */

// disable blockchain watchers
process.env.START_WATCHERS = false;

const app = require('../src/app');
const { updateEntity } = require('../src/services/donations/updateEntityCounters');
const { AdminTypes } = require('../src/models/pledgeAdmins.model');

async function run() {
  console.log('updating all entity counters');

  const dacs = await app.service('dacs').find({ paginate: false });
  const dacPromises = dacs.map(dac => updateEntity(app, dac._id, AdminTypes.DAC));

  const campaigns = await app.service('campaigns').find({ paginate: false });
  const campaignPromises = campaigns.map(campaign =>
    updateEntity(app, campaign._id, AdminTypes.CAMPAIGN),
  );

  const milestones = await app.service('milestones').find({ paginate: false });
  const milestonePromises = milestones.map(milestone =>
    updateEntity(app, milestone._id, AdminTypes.MILESTONE),
  );

  await Promise.all([...dacPromises, ...campaignPromises, ...milestonePromises]);

  console.log('successfully recalculated all entity counters');
}

run().then(() => process.exit());
