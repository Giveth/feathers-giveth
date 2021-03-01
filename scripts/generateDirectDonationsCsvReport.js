const { writeFileSync } = require('fs');
const config = require('config');
const { Parser } = require('json2csv');
const mongoose = require('mongoose');
require('mongoose-long')(mongoose);
require('../src/models/mongoose-bn')(mongoose);
const { getTokenByAddress } = require('../src/utils/tokenHelper');
const { createModel } = require('../src/models/donations.model');

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
const milestoneModel = require('../src/models/milestones.model').createModel(app);
const campaignModel = require('../src/models/campaigns.model').createModel(app);

const createAggregateQuery = ownerType => {
  const matchQuery = { homeTxHash: { $exists: true }, ownerType };
  let projectForeignKey = 'ownerTypeId';
  if (ownerType === 'giver') {
    ownerType = 'dac';
    projectForeignKey = 'delegateTypeId';
  }
  return [
    // Add giver
    { $match: matchQuery },
    {
      $lookup: {
        let: { giverAddress: '$giverAddress' },
        from: 'users',
        pipeline: [
          {
            $match: { $expr: { $eq: ['$address', '$$giverAddress'] } },
          },
        ],
        as: 'giver',
      },
    },
    {
      $unwind: '$giver',
    },

    // Add project (DAC, Campaign, Milestone) but currently just the milestone will be used
    {
      $lookup: {
        from: `${ownerType}s`,
        let: { id: { $toObjectId: `$${projectForeignKey}` } },
        pipeline: [
          {
            $match: { $expr: { $eq: ['$_id', '$$id'] } },
          },
        ],
        as: ownerType,
      },
    },
    {
      $unwind: `$${ownerType}`,
    },
  ];
};
const normalizeDonation = async donation => {
  const dappUrl = config.get('dappUrl');
  // Currently dac and campaign dont used in CSV maybe other time we use them
  const { campaign, dac, tokenAddress, milestone } = donation;
  let { ownerType } = donation;
  if (ownerType === 'giver') {
    ownerType = 'dac';
  }
  const token = getTokenByAddress(tokenAddress);
  const data = {
    usdValue: donation.usdValue,
    amount: donation.amount / 10 ** 18,
    tokenSymbol: token.symbol,
    ownerType,
    giverAddress: donation.giverAddress,
    giverName: donation.giver && donation.giver.name,
    createdAt: donation.createdAt.toUTCString(),
    homeTxHash: donation.homeTxHash,
    etherscanLink: `https://etherscan.io/tx/${donation.homeTxHash}`,
    tokenAddress,
  };
  if (ownerType === 'milestone') {
    data.projectLink = `${dappUrl}/campaigns/${milestone.campaignId}/milestones/${milestone._id}`;
    data.campaignName = (await campaignModel.findOne({_id :milestone.campaignId})).title
  } else if (ownerType === 'campaign') {
    data.projectLink = `${dappUrl}/campaigns/${donation.ownerTypeId}`;
    data.campaignName = campaign.title
  } else if (ownerType === 'dac') {
    data.projectLink = `${dappUrl}/dacs/${donation.delegateTypeId}`;
  }
  return data;
};

const donationModel = createModel(app);
const directDonationsReport = async () => {
  const campaignDonations = await donationModel.aggregate(createAggregateQuery('campaign'));
  const milestoneDonations = await donationModel.aggregate(createAggregateQuery('milestone'));
  const dacDonations = await donationModel.aggregate(createAggregateQuery('giver'));
  const donationsWithoutNormalization = milestoneDonations
    .concat(...campaignDonations)
    .concat(...dacDonations)
    .sort((a, b) => {
      if (a.createdAt < b.createdAt) return -1;
      if (a.createdAt > b.createdAt) return 1;
      return 0;
    })
  const donations = [];
  for (const donation of donationsWithoutNormalization){
    donations.push(await normalizeDonation(donation))
  }
  // const fields = Object.keys(donations[0]);
  const fields = [
    {
      label: 'Amount',
      value: 'amount',
    },
    {
      label: 'Token',
      value: 'tokenSymbol',
    },
    {
      label: 'USD value',
      value: 'usdValue',
    },
    {
      label: 'Owner Type',
      value: 'ownerType',
    },
    {
      label: 'Giver Address',
      value: 'giverAddress',
    },
    {
      label: 'Giver name',
      value: 'giverName',
    },
    {
      label: 'Campaign name',
      value: 'campaignName',
    },
    {
      label: 'Project Link',
      value: 'projectLink',
    },
    // {
    //   label: 'Transaction Hash',
    //   value: 'homeTxHash',
    // },
    {
      label: 'Etherscan link',
      value: 'etherscanLink',
    },
    {
      label: 'Time',
      value: 'createdAt',
    },
  ];
  const opts = { fields };
  const parser = new Parser(opts);
  const csv = parser.parse(donations);
  const dir = process.env.CSV_PATH || './directDonationsReport.csv';
  writeFileSync(dir, csv);
  console.log('csv generated at ', dir);
};

const mongoUrl = config.mongodb;
mongoose.connect(mongoUrl);
const db = mongoose.connection;

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
