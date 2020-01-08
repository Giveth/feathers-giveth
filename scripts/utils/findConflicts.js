/* eslint-disable no-continue */
const Web3 = require('web3');
const fs = require('fs');
const BigNumber = require('bignumber.js');
const mongoose = require('mongoose');
require('mongoose-long')(mongoose);
require('../../src/models/mongoose-bn')(mongoose);
const { LiquidPledging, LiquidPledgingState } = require('giveth-liquidpledging');

// const web3Helper = require('../../src/blockchain/lib/web3Helpers');
const config = require('../../config/default.json');

// Map token symbol to foreign address
const tokenSymbolToForeignAddress = {};
config.tokenWhitelist.forEach(token => {
  tokenSymbolToForeignAddress[token.symbol] = token.foreignAddress;
});

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
const getStatus = async updateCache => {
  const cacheFile = './liquidPledgingState.json';
  let status;
  if (updateCache) {
    const foreignWeb3 = instantiateWeb3(nodeUrl);
    const liquidPledging = new LiquidPledging(foreignWeb3, liquidPledgingAddress);
    const liquidPledgingState = new LiquidPledgingState(liquidPledging);

    // const [numberOfPledges] = await web3Helper.executeRequestsAsBatch(foreignWeb3, [
    //   liquidPledging.$contract.methods.numberOfPledges().call.request,
    // ]);
    // console.log('Number of pledges', numberOfPledges);

    status = await liquidPledgingState.getState();

    fs.writeFileSync(cacheFile, JSON.stringify(status, null, 2));
  } else {
    status = JSON.parse(fs.readFileSync(cacheFile));
  }

  return status;
};

const findEntityConflicts = (model, projectBalanceMap) => {
  const cursor = model
    .find({
      projectId: { $exists: true },
    })
    .cursor();

  return cursor.eachAsync(async entity => {
    const balance = projectBalanceMap.get(String(entity.projectId));

    entity.donationCounters.forEach(dc => {
      const { symbol, currentBalance: dbBalance } = dc;
      const foreignAddress = tokenSymbolToForeignAddress[symbol];
      const blockchainBalance = balance[foreignAddress];

      if (dbBalance.toString() !== blockchainBalance.toString()) {
        console.log(
          'conflict found on',
          model.modelName,
          entity.title,
          entity._id,
          ':',
          symbol,
          'value in db',
          dbBalance.toString(),
          'value in smart contract',
          blockchainBalance,
        );
      }
    });
  });
};

const main = async updateCache => {
  try {
    const status = await getStatus(updateCache);
    const { pledges, admins } = status;

    const adminProjects = new Set();
    for (let i = 1; i < admins.length; i += 1) {
      if (admins[i].type === 'Project') {
        adminProjects.add(i);
      }
    }

    const projectBalanceMap = new Map();

    for (let i = 1; i < pledges.length; i += 1) {
      const pledge = pledges[i];
      const { amount, owner, token } = pledge;

      if (amount === '0' || !adminProjects.has(Number(owner))) continue;

      let balance = projectBalanceMap.get(owner);
      if (balance === undefined) {
        balance = {};
        balance[token] = new BigNumber(amount);
        projectBalanceMap.set(owner, balance);
      } else {
        const prevAmount = balance[token] || new BigNumber(0);
        balance[token] = prevAmount.plus(amount);
      }
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
        findEntityConflicts(Milestones, projectBalanceMap),
        findEntityConflicts(Campaigns, projectBalanceMap),
      ]).then(() => process.exit());
    });
  } catch (e) {
    console.log(e);
    throw e;
  }
};

main(false)
  .then(() => {})
  .catch(() => process.exit(1));
