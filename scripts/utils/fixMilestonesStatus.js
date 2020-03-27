/* eslint-disable no-console */
const mongoose = require('mongoose');
require('mongoose-long')(mongoose);
const { ZERO_ADDRESS } = require('../../src/blockchain/lib/web3Helpers');

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

const Milestones = require('../../src/models/milestones.model').createModel(app);
const Events = require('../../src/models/events.model').createModel(app);

const { EventStatus } = require('../../src/models/events.model');
const { MilestoneStatus } = require('../../src/models/milestones.model');

const {
  COMPLETED,
  NEEDS_REVIEW,
  IN_PROGRESS,
  REJECTED,
  CANCELED,
  PAID,
  ARCHIVED,
} = MilestoneStatus;

const eventToStatus = {
  ApproveCompleted: COMPLETED,
  CancelProject: CANCELED,
  MilestoneCompleteRequestApproved: COMPLETED,
  MilestoneCompleteRequestRejected: IN_PROGRESS,
  MilestoneCompleteRequested: NEEDS_REVIEW,
  // "PaymentCollected", // expected status depends on milestone
  ProjectAdded: IN_PROGRESS,
  // "ProjectUpdated", // Does not affect milestone status
  // "RecipientChanged", // Does not affect milestone status
  RejectCompleted: REJECTED,
  RequestReview: NEEDS_REVIEW,
};

const getExpectedStatus = (events, milestone) => {
  const lastEvent = events.pop();
  if (lastEvent === 'PaymentCollected') {
    const { maxAmount, donationCounters, fullyFunded, reviewerAddress } = milestone;
    const hasReviewer = reviewerAddress && reviewerAddress !== ZERO_ADDRESS;
    if (
      maxAmount &&
      (fullyFunded || hasReviewer) &&
      donationCounters[0].currentBalance.toString() === '0'
    ) {
      return PAID;
    }
    return getExpectedStatus(events, milestone);
  }
  return eventToStatus[lastEvent];
};

const main = async () => {
  // A map from projectId to milestone info
  const milestoneMap = new Map();

  await Milestones.find({ projectId: { $gt: 0 } })
    .select([
      '_id',
      'projectId',
      'maxAmount',
      'fullyFunded',
      'reviewerAddress',
      'status',
      'donationCounters',
    ])
    .cursor()
    .eachAsync(
      m => {
        milestoneMap.set(m.projectId.toString(), m);
      },
      {
        parallel: 30,
      },
    );

  const cursor = await Events.aggregate([
    {
      $match: {
        'returnValues.idProject': { $in: Array.from(milestoneMap.keys()) },
        status: EventStatus.PROCESSED,
        event: { $nin: ['ProjectUpdated', 'RecipientChanged'] },
      },
    },
    { $sort: { blockNumber: 1 } },
    { $group: { _id: '$returnValues.idProject', events: { $push: '$event' } } },
  ])
    .cursor()
    .exec();
  await cursor.eachAsync(async ({ _id: projectId, events }) => {
    const milestone = milestoneMap.get(projectId);
    const { status } = milestone;

    if ([ARCHIVED, CANCELED].includes(status)) return;

    let message = '';
    message += `Project ID: ${projectId}\n`;
    message += `Events: ${events.toString()}\n`;

    const expectedStatus = getExpectedStatus(events, milestone);

    if (expectedStatus !== status) {
      const { maxAmount, _id, fullyFunded, donationCounters, reviewerAddress } = milestone;
      message += `Milestone ${_id.toString()} status is ${status} but should be ${expectedStatus}\n`;

      if (maxAmount) message += `Max Amount: ${maxAmount.toString()}\n`;

      if (fullyFunded !== undefined) message += `Fully Funded: ${fullyFunded}\n`;

      if (reviewerAddress !== undefined) message += `Reviewer Address: ${reviewerAddress}\n`;

      donationCounters.forEach(dc => {
        message += `${dc.name} balance is ${dc.currentBalance.toString()}\n`;
      });

      message += 'Updating...\n';

      message += '-----------------------\n';
      console.log(message);
      await Milestones.update({ _id }, { status: expectedStatus }).exec();
    }
  });
};

const mongoUrl = config.mongodb;
console.log('url:', mongoUrl);
mongoose.connect(mongoUrl);
const db = mongoose.connection;

db.on('error', err => console.error('Could not connect to Mongo', err));

db.once('open', () => {
  console.log('Connected to Mongo');

  main().then(() => {
    console.log('Finished');
    process.exit(0);
  });
});
