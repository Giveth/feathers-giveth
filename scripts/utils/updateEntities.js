const mongoose = require('mongoose');
require('mongoose-long')(mongoose);
require('../../src/models/mongoose-bn')(mongoose);
const _groupBy = require('lodash.groupby');
const { toBN } = require('web3-utils');

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
const DACs = require('../../src/models/dacs.model').createModel(app);
const Campaigns = require('../../src/models/campaigns.model').createModel(app);
const Donations = require('../../src/models/donations.model').createModel(app);

const { DonationStatus } = require('../../src/models/donations.model');
const { MilestoneStatus } = require('../../src/models/milestones.model');
const { CampaignStatus } = require('../../src/models/campaigns.model');
const { AdminTypes } = require('../../src/models/pledgeAdmins.model');
const { ANY_TOKEN } = require('../../src/blockchain/lib/web3Helpers');

const terminateScript = (message = '', code = 0) =>
  process.stdout.write(`Exit message: ${message}`, () => process.exit(code));

const mongoUrl = config.mongodb;
console.log('url:', mongoUrl);
mongoose.connect(mongoUrl);

const updateEntity = async (model, type) => {
  const donationQuery = {
    // $select: ['amount', 'giverAddress', 'amountRemaining', 'token', 'status', 'isReturn'],
    mined: true,
    status: { $nin: [DonationStatus.FAILED, DonationStatus.PAYING, DonationStatus.PAID] },
  };

  let idFieldName;
  if (type === AdminTypes.DAC) {
    // TODO I think this can be gamed if the donor refunds their donation from the dac
    Object.assign(donationQuery, {
      delegateType: AdminTypes.DAC,
      $and: [
        {
          $or: [{ intendedProjectId: 0 }, { intendedProjectId: undefined }],
        },
        {
          $or: [{ parentDonations: { $not: { $size: 0 } } }, { amountRemaining: { $ne: '0' } }],
        },
      ],
    });
    idFieldName = 'delegateTypeId';
  } else if (type === AdminTypes.CAMPAIGN) {
    Object.assign(donationQuery, {
      ownerType: AdminTypes.CAMPAIGN,
    });
    idFieldName = 'ownerTypeId';
  } else if (type === AdminTypes.MILESTONE) {
    Object.assign(donationQuery, {
      ownerType: AdminTypes.MILESTONE,
    });
    idFieldName = 'ownerTypeId';
  } else {
    return;
  }

  await model
    .find({})
    .cursor()
    .eachAsync(async entity => {
      const oldDonationCounters = entity.donationCounters;
      const query = { ...donationQuery };
      query[idFieldName] = entity._id;

      const donations = await Donations.find(query).exec();

      const returnedDonations = await Donations.find({
        isReturn: true,
        mined: true,
        parentDonations: { $in: donations.map(d => d._id) },
      }).exec();

      // first group by token (symbol)
      const groupedDonations = _groupBy(donations, d => (d.token && d.token.symbol) || 'ETH');
      const groupedReturnedDonations = _groupBy(
        returnedDonations,
        d => (d.token && d.token.symbol) || 'ETH',
      );

      // and calculate cumulative token balances for each donated token
      const donationCounters = Object.keys(groupedDonations).map(symbol => {
        const tokenDonations = groupedDonations[symbol];
        const returnedTokenDonations = groupedReturnedDonations[symbol] || [];

        // eslint-disable-next-line prefer-const
        let { totalDonated, currentBalance } = tokenDonations.reduce(
          (accumulator, d) => ({
            totalDonated: d.isReturn
              ? accumulator.totalDonated
              : accumulator.totalDonated.add(toBN(d.amount)),
            currentBalance: accumulator.currentBalance.add(toBN(d.amountRemaining)),
          }),
          {
            totalDonated: toBN(0),
            currentBalance: toBN(0),
          },
        );

        // Exclude returned values from canceled milestones
        if (
          !(type === AdminTypes.MILESTONE && entity.status === MilestoneStatus.CANCELED) &&
          !(type === AdminTypes.CAMPAIGN && entity.status === CampaignStatus.CANCELED)
        ) {
          totalDonated = returnedTokenDonations.reduce(
            (acc, d) => acc.sub(toBN(d.amount)),
            totalDonated,
          );
        }

        const donationCount = tokenDonations.filter(d => !d.isReturn).length;

        // find the first donation in the group that has a token object
        // b/c there are other donation objects coming through as well
        const tokenDonation = tokenDonations.find(d => typeof d.token === 'object');

        return {
          name: tokenDonation.token.name,
          address: tokenDonation.token.address,
          foreignAddress: tokenDonation.token.foreignAddress,
          decimals: tokenDonation.token.decimals,
          symbol,
          totalDonated,
          currentBalance,
          donationCount,
        };
      });

      let shouldUpdateEntity = false;
      const mutations = {};
      let message = '';

      const typeName = type[0].toUpperCase() + type.slice(1);

      if (donationCounters.length !== oldDonationCounters.length) {
        message += `${typeName} ${entity._id.toString()} (${
          entity.status
        }) donation counter length is changed from ${oldDonationCounters.length} to ${
          donationCounters.length
        }\n`;
        mutations.donationCounters = donationCounters;
        shouldUpdateEntity = true;
      } else {
        donationCounters.forEach(dc => {
          const oldDC = oldDonationCounters.find(item => item.symbol === dc.symbol);
          if (
            oldDC === undefined ||
            oldDC.totalDonated.toString() !== dc.totalDonated.toString() ||
            oldDC.currentBalance.toString() !== dc.currentBalance.toString() ||
            oldDC.donationCount !== dc.donationCount
          ) {
            message += `${typeName} ${entity._id.toString()} (${
              entity.status
            }) donation counter should be updated\n`;
            message += `Old:\n${JSON.stringify(
              {
                symbol: oldDC.symbol,
                totalDonated: oldDC.totalDonated.toString(),
                currentBalance: oldDC.currentBalance.toString(),
              },
              null,
              2,
            )}\n`;
            message += `New:\n${JSON.stringify(
              {
                symbol: dc.symbol,
                totalDonated: dc.totalDonated.toString(),
                currentBalance: dc.currentBalance.toString(),
              },
              null,
              2,
            )}\n`;

            mutations.donationCounters = donationCounters;
            shouldUpdateEntity = true;
          }
        });
      }

      const fullyFunded = !!(
        type === AdminTypes.MILESTONE &&
        donationCounters.length > 0 &&
        entity.token.foreignAddress !== ANY_TOKEN.foreignAddress &&
        entity.maxAmount &&
        entity.maxAmount.sub(
          donationCounters.find(dc => dc.symbol === entity.token.symbol).totalDonated,
        ) < 10000000000
      ); // Difference less than this number is negligible

      if (
        (fullyFunded === true || entity.fullyFunded !== undefined) &&
        entity.fullyFunded !== fullyFunded
      ) {
        message += `Diff: ${entity.maxAmount.sub(
          donationCounters.find(dc => dc.symbol === entity.token.symbol).totalDonated,
        )}\n`;
        message += `${typeName} ${entity._id.toString()} (${
          entity.status
        }) fullyFunded status changed from ${entity.fullyFunded} to ${fullyFunded}\n`;
        shouldUpdateEntity = true;
        mutations.fullyFunded = fullyFunded;
      }

      const peopleCount = new Set(donations.map(d => d.giverAddress)).size;
      if (
        !(peopleCount === 0 && entity.peopleCount === undefined) &&
        peopleCount !== entity.peopleCount
      ) {
        message += `${typeName} ${entity._id.toString()} peopleCount value changed from ${
          entity.peopleCount
        } to ${peopleCount}\n`;
        shouldUpdateEntity = true;
        mutations.peopleCount = peopleCount;
      }

      if (shouldUpdateEntity) {
        console.log(`----------------------------\n${message}\nUpdating...`);
        await model.update({ _id: entity._id }, mutations).exec();
      }
    });
};
const main = async () => {
  await Promise.all([
    updateEntity(DACs, AdminTypes.DAC),
    updateEntity(Campaigns, AdminTypes.CAMPAIGN),
    updateEntity(Milestones, AdminTypes.MILESTONE),
  ]);
};

const db = mongoose.connection;
db.on('error', err => console.error('Could not connect to Mongo', err));
db.once('open', () => {
  console.log('Connected to Mongo');

  main().then(() => terminateScript('Finished', 0));
});
