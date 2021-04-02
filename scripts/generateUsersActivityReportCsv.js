/**
 * NODE_ENV=beta node ./scripts/generateUsersActivityReportCsv.js
 */

const { writeFileSync } = require('fs');
const config = require('config');
const { Parser } = require('json2csv');
const mongoose = require('mongoose');

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
const aggregteQuery = [
  {
    $match: {},
  },
  {
    $lookup: {
      from: 'milestones',
      let: { ownerAddress: '$address' },
      pipeline: [
        {
          $match: {
            $expr: {
              $eq: ['$$ownerAddress', '$ownerAddress'],
            },
          },
        },
        { $count: 'count' },
      ],
      as: 'milestonesCounts',
    },
  },
  {
    $addFields: {
      createdMilestonesCount: { $sum: '$milestonesCounts.count' },
    },
  },
  {
    $lookup: {
      from: 'milestones',
      let: { recipientAddress: '$address' },
      pipeline: [
        {
          $match: {
            $expr: {
              $eq: ['$$recipientAddress', '$recipientAddress'],
            },
          },
        },
        { $count: 'count' },
      ],
      as: 'receivedMilestonesCounts',
    },
  },
  {
    $addFields: {
      receivedMilestonesCount: { $sum: '$receivedMilestonesCounts.count' },
    },
  },
  {
    $lookup: {
      from: 'milestones',
      let: { reviewerAddress: '$address' },
      pipeline: [
        {
          $match: {
            $expr: {
              $eq: ['$$reviewerAddress', '$reviewerAddress'],
            },
          },
        },
        { $count: 'count' },
      ],
      as: 'reviewedMilestonesCounts',
    },
  },
  {
    $addFields: {
      reviewedMilestonesCount: { $sum: '$reviewedMilestonesCounts.count' },
    },
  },
  {
    $lookup: {
      from: 'dacs',
      let: { ownerAddress: '$address' },
      pipeline: [
        {
          $match: {
            $expr: {
              $eq: ['$$ownerAddress', '$ownerAddress'],
            },
          },
        },
        { $count: 'count' },
      ],
      as: 'dacsCounts',
    },
  },

  {
    $addFields: {
      dacsCount: { $sum: '$dacsCounts.count' },
    },
  },
  {
    $lookup: {
      from: 'campaigns',
      let: { ownerAddress: '$address' },
      pipeline: [
        {
          $match: {
            $expr: {
              $eq: ['$$ownerAddress', '$ownerAddress'],
            },
          },
        },
        { $count: 'count' },
      ],
      as: 'campaignsCounts',
    },
  },
  {
    $addFields: {
      campaignsCount: { $sum: '$campaignsCounts.count' },
    },
  },
  {
    $lookup: {
      from: 'transactions',
      let: { from: '$address' },
      pipeline: [
        {
          $match: {
            $expr: {
              $eq: ['$$from', '$from'],
            },
          },
        },
      ],
      as: 'ascendingTransactions',
    },
  },
  {
    $addFields: {
      firstTransaction: { $arrayElemAt: ['$ascendingTransactions', 0] },
    },
  },
  {
    $addFields: {
      firstUse: '$firstTransaction.timestamp',
    },
  },
  {
    $lookup: {
      from: 'transactions',
      let: { from: '$address' },
      pipeline: [
        {
          $match: {
            $expr: {
              $eq: ['$$from', '$from'],
            },
          },
        },
        {
          $sort: {
            timestamp: -1,
          },
        },
      ],
      as: 'descendingTransactions',
    },
  },
  {
    $addFields: {
      lastTransaction: { $arrayElemAt: ['$descendingTransactions', 0] },
    },
  },
  {
    $addFields: {
      lastUse: '$lastTransaction.timestamp',
    },
  },
  {
    $project: {
      createdMilestonesCount: 1,
      receivedMilestonesCount: 1,
      reviewedMilestonesCount: 1,
      dacsCount: 1,
      campaignsCount: 1,
      address: 1,
      name: 1,
      firstUse: 1,
      lastUse: 1,
    },
  },
];

const mongoUrl = config.mongodb;
mongoose.connect(mongoUrl);
const db = mongoose.connection;
const directDonationsReport = async () => {
  const users = await db
    .collection('users')
    .aggregate(aggregteQuery)
    .toArray();
  users.forEach((user, i) => {
    if (user.firstUse) {
      users[i].firstUse = user.firstUse.toUTCString();
      users[i].lastUse = user.lastUse.toUTCString();
    }
  });
  const fields = [
    {
      label: 'Address',
      value: 'address',
    },
    {
      label: 'Giveth Name',
      value: 'name',
    },
    {
      label: '# of DACs created',
      value: 'dacsCount',
    },
    {
      label: '# of Campaigns created',
      value: 'campaignsCount',
    },
    {
      label: '# of Milestones Created',
      value: 'createdMilestonesCount',
    },
    {
      label: '# of Milestones Reviewed',
      value: 'reviewedMilestonesCount',
    },
    {
      label: '# of Milestones Recieved',
      value: 'receivedMilestonesCount',
    },
    {
      label: 'first use',
      value: 'firstUse',
    },
    {
      label: 'last use',
      value: 'lastUse',
    },
  ];
  const opts = { fields };
  const parser = new Parser(opts);
  const csv = parser.parse(users);
  const dir = process.env.CSV_PATH || './usersActivityReport.csv';
  writeFileSync(dir, csv);
  console.log('csv generated at ', dir);
};

db.on('error', err => {
  throw err;
});

db.once('open', async () => {
  try {
    await directDonationsReport();
    process.exit(0);
  } catch (e) {
    console.log('error ', e);
    process.exit(0);
  }
});
