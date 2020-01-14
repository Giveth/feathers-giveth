/* eslint-disable no-continue */
/* eslint-disable no-console */
const Web3 = require('web3');
const fs = require('fs');
const BigNumber = require('bignumber.js');
const mongoose = require('mongoose');
require('mongoose-long')(mongoose);
require('../../src/models/mongoose-bn')(mongoose);
const { LiquidPledging, LiquidPledgingState } = require('giveth-liquidpledging');

// const web3Helper = require('../../src/blockchain/lib/web3Helpers');

const configFileName = 'default'; // default or beta

// eslint-disable-next-line import/no-dynamic-require
const config = require(`../../config/${configFileName}.json`);

// Map token symbol to foreign address
const tokenSymbolToForeignAddress = {};
config.tokenWhitelist.forEach(token => {
  tokenSymbolToForeignAddress[token.symbol] = token.foreignAddress.toLowerCase();
});

const tokensForeignAddress = config.tokenWhitelist.map(t => t.foreignAddress.toLowerCase());

const { nodeUrl, liquidPledgingAddress } = config.blockchain;

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
const Campaigns = require('../../src/models/campaigns.model').createModel(app);
const Donations = require('../../src/models/donations.model').createModel(app);

const { DonationStatus } = require('../../src/models/donations.model');

// Instantiate Web3 module
// @params {string} url blockchain node url address
const instantiateWeb3 = url => {
  const provider =
    url && url.startsWith('ws')
      ? new Web3.providers.WebsocketProvider(url, {
          clientConfig: {
            maxReceivedFrameSize: 100000000,
            maxReceivedMessageSize: 100000000,
          },
        })
      : url;
  return new Web3(provider);
};

// Gets status of liquidpledging storage
// @param {boolean} updateCache whether get new status from blockchain or load from cached file
const getBlockchainData = async updateCache => {
  const cacheFile = `./liquidPledgingState_${configFileName}.json`;
  const eventsFile = `./liquidPledgingEvents_${configFileName}.json`;

  if (updateCache) {
    const foreignWeb3 = instantiateWeb3(nodeUrl);
    const liquidPledging = new LiquidPledging(foreignWeb3, liquidPledgingAddress);
    const liquidPledgingState = new LiquidPledgingState(liquidPledging);

    // const [numberOfPledges, numberOfPledgeAdmins] = await web3Helper.executeRequestsAsBatch(
    //   foreignWeb3,
    //   [
    //     liquidPledging.$contract.methods.numberOfPledges().call.request,
    //     liquidPledging.$contract.methods.numberOfPledgeAdmins().call.request,
    //   ],
    // );
    // console.log('Number of pledges', numberOfPledges);
    // console.log('Number of pledge admins', numberOfPledgeAdmins);

    const [status, events] = await Promise.all([
      liquidPledgingState.getState(),
      // Just transfer events
      liquidPledging.$contract.getPastEvents('Transfer', {
        fromBlock: 0,
        toBlock: 'latest',
      }),
    ]);

    fs.writeFileSync(cacheFile, JSON.stringify(status, null, 2));
    fs.writeFileSync(eventsFile, JSON.stringify(events, null, 2));

    return { status, events };
  }
  return {
    status: JSON.parse(fs.readFileSync(cacheFile)),
    events: JSON.parse(fs.readFileSync(eventsFile)),
  };
};

const findEntityConflicts = (model, projectPledgeMap, fixConflicts = false, pledges) => {
  const cursor = model
    .find({
      projectId: { $exists: true },
    })
    .cursor();

  return cursor.eachAsync(async entity => {
    const balance = projectPledgeMap.get(String(entity.projectId)) || {};

    const balancePledged = balance.Pledged || {};

    const { donationCounters } = entity;

    let conflictFound = false;
    const setObject = {};

    /*
     Update entity donationCounters
    */
    donationCounters.forEach((dc, index) => {
      const { symbol, currentBalance: dbBalance } = dc;
      const foreignAddress = tokenSymbolToForeignAddress[symbol];
      const tokenBalance = balancePledged[foreignAddress];

      if (tokenBalance === undefined) {
        console.warn(
          `There is no balance for token ${symbol} in blockchain for ${model.modelName} ${entity._id}`,
        );
        return;
      }

      if (dbBalance.toString() !== tokenBalance.amount.toFixed(0)) {
        const dbBalanceFromWei = Web3.utils.fromWei(dbBalance.toString());
        const blockchainBalanceFromWei = Web3.utils.fromWei(tokenBalance.amount.toFixed(0));

        console.log(
          'conflict found on',
          model.modelName,
          entity.title,
          entity._id,
          ':',
          symbol,
          'value in db',
          dbBalanceFromWei,
          'value in smart contract',
          blockchainBalanceFromWei,
          tokenBalance.pledges,
        );

        if (fixConflicts) {
          conflictFound = true;

          setObject[`donationCounters.${index}.currentBalance`] = tokenBalance.amount.toFixed();
        }
      }
    });

    if (conflictFound) {
      await model
        .update(
          { _id: entity._id },
          {
            $set: {
              ...setObject,
            },
          },
        )
        .exec();
    }

    /*
    Update donations
     */
    const [paidDonations, payingDonations, committedDonations] = await Promise.all(
      [DonationStatus.PAID, DonationStatus.PAYING, DonationStatus.COMMITTED].map(status => {
        return Donations.find({
          ownerTypeId: entity._id,
          status,
        }).exec();
      }),
    );

    // Find conflict in donations
    [
      {
        pledgeStatus: 'Pledged',
        donationStatus: DonationStatus.COMMITTED,
        donations: committedDonations,
      },
      {
        pledgeStatus: 'Paying',
        donationStatus: DonationStatus.PAYING,
        donations: payingDonations,
      },
      {
        pledgeStatus: 'Paid',
        donationStatus: DonationStatus.PAID,
        donations: paidDonations,
      },
    ].forEach(item => {
      const { pledgeStatus, donationStatus, donations } = item;

      tokensForeignAddress.forEach(tokenAddress => {
        if (!balance[pledgeStatus]) return;

        const thisBalance = balance[pledgeStatus][tokenAddress];
        if (!thisBalance) return;

        thisBalance.pledges.forEach(pledgeId => {
          const pledge = pledges[pledgeId];

          const pledgeDonations = donations.filter(d => d.pledgeId.toNumber() === pledgeId);

          let donationsAmount = new BigNumber(0);

          pledgeDonations.forEach(d => {
            if (d.status !== donationStatus)
              console.error(
                `Donation ${d._id} status should be ${donationStatus} but is ${d.status}`,
              );
            donationsAmount = donationsAmount.plus(d.amount.toString());
          });

          if (pledge.amount !== donationsAmount.toFixed()) {
            console.warn(
              `Pledge ${pledgeId} amount is ${pledge.amount} but sum of ${
                pledgeDonations.length
              } donations is ${donationsAmount.toFixed()}`,
            );
          }
        });
      });
    });
  });
};

const main = async (updateCache, findConflict, fixConflicts = false) => {
  try {
    const { status } = await getBlockchainData(updateCache);

    if (!findConflict) return;

    const { pledges, admins } = status;

    const projectAdmins = new Set();
    for (let i = 1; i < admins.length; i += 1) {
      if (admins[i].type === 'Project') {
        projectAdmins.add(i);
      }
    }

    const projectPledgeMap = new Map();
    const pledgeChildrenMap = new Map();

    for (let i = 1; i < pledges.length; i += 1) {
      const pledge = pledges[i];
      const { amount, owner, pledgeState, oldPledge } = pledge;
      const token = pledge.token.toLowerCase();

      if (!projectAdmins.has(Number(owner))) {
        // console.warn(`owner ${owner} is not a project`);
        continue;
      }

      if (oldPledge !== '0') {
        const children = pledgeChildrenMap.get(Number(oldPledge)) || [];
        children.push(i);
        pledgeChildrenMap.set(Number(oldPledge), children);
      }

      const balance = projectPledgeMap.get(owner) || { Pledged: {}, Paying: {}, Paid: {} };
      const donationCounter = balance[pledgeState][token] || {
        pledges: [],
        amount: new BigNumber(0),
      };
      donationCounter.pledges.push(i);
      donationCounter.amount = donationCounter.amount.plus(amount);
      balance[pledgeState][token] = donationCounter;
      projectPledgeMap.set(owner, balance);
    }

    /*
     Find conflicts in milestone donation counter
    */
    const mongoUrl = config.mongodb;
    console.log('url:', mongoUrl);
    mongoose.connect(mongoUrl);
    const db = mongoose.connection;

    db.on('error', err => console.error('Could not connect to Mongo', err));

    db.once('open', () => {
      console.log('Connected to Mongo');

      Promise.all([
        findEntityConflicts(Milestones, projectPledgeMap, fixConflicts, pledges, pledgeChildrenMap),
        findEntityConflicts(Campaigns, projectPledgeMap, fixConflicts, pledges, pledgeChildrenMap),
      ]).then(() => process.exit());
    });
  } catch (e) {
    console.log(e);
    throw e;
  }
};

main(false, true, false)
  .then(() => {})
  .catch(() => process.exit(1));
