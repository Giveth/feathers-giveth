const mongoose = require('mongoose');
require('mongoose-long')(mongoose);
const { toBN } = require('web3-utils');

const configFileName = 'default'; // default or beta

// eslint-disable-next-line import/no-dynamic-require
const config = require(`../../config/${configFileName}.json`);

const fixConflicts = true;

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

const Milestones = require('../../src/models/milestones.model').createModel(app);
const Events = require('../../src/models/events.model').createModel(app);

const { EventStatus } = require('../../src/models/events.model');
const { MilestoneStatus } = require('../../src/models/milestones.model');

const terminateScript = (message = '', code = 0) =>
  process.stdout.write(`Exit message: ${message}\n`, () => process.exit(code));

const mongoUrl = config.mongodb;
console.log('url:', mongoUrl);
mongoose.connect(mongoUrl);
const db = mongoose.connection;

db.on('error', err => console.error('Could not connect to Mongo', err));

db.once('open', () => {
  console.log('Connected to Mongo');
  Events.find({
    event: 'PaymentCollected',
    status: EventStatus.PROCESSED,
  })
    .cursor()
    .eachAsync(async event => {
      const { idProject } = event.returnValues;

      const [milestone] = await Milestones.find(
        { projectId: Number(idProject) },
        'fullyFunded status donationCounters',
      ).exec();

      if (milestone === undefined) {
        terminateScript(`Couldn't find milestone for ProjectId ${idProject}`);
        return;
      }

      const { _id, fullyFunded, status, donationCounters } = milestone;
      const { IN_PROGRESS, PAID } = MilestoneStatus;
      if (
        fullyFunded === true &&
        status === IN_PROGRESS &&
        !donationCounters.some(dc => dc.currentBalance.gt(toBN(0)))
      ) {
        console.log('-----------------------');
        console.log(`Milestone ${_id} status should change from ${status} to ${PAID}`);
        if (fixConflicts) {
          console.log('Updating...');
          await Milestones.update({ _id }, { status: PAID }).exec();
        }
      }
    })
    .then(() => {
      console.log('Finished');
      process.exit(0);
    });
});
