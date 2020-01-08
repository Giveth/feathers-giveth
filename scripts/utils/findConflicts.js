/* eslint-disable no-continue */
const Web3 = require('web3');
const fs = require('fs');
const BigNumber = require('bignumber.js');
const mongoose = require('mongoose');
require('mongoose-long')(mongoose);
require('../../src/models/mongoose-bn')(mongoose);
const { LiquidPledging, LiquidPledgingState } = require('giveth-liquidpledging');

const web3Helper = require('../../src/blockchain/lib/web3Helpers');

const configFileName = 'beta'; // default or beta

// eslint-disable-next-line import/no-dynamic-require
const config = require(`../../config/${configFileName}.json`);

// Map token symbol to foreign address
const tokenSymbolToForeignAddress = {};
config.tokenWhitelist.forEach(token => {
  tokenSymbolToForeignAddress[token.symbol] = token.foreignAddress.toLowerCase();
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
  const cacheFile = `./liquidPledgingState_${configFileName}.json`;
  let status;
  if (updateCache) {
    const foreignWeb3 = instantiateWeb3(nodeUrl);
    const liquidPledging = new LiquidPledging(foreignWeb3, liquidPledgingAddress);
    const liquidPledgingState = new LiquidPledgingState(liquidPledging);

    const [numberOfPledges, numberOfPledgeAdmins] = await web3Helper.executeRequestsAsBatch(
      foreignWeb3,
      [
        liquidPledging.$contract.methods.numberOfPledges().call.request,
        liquidPledging.$contract.methods.numberOfPledgeAdmins().call.request,
      ],
    );
    console.log('Number of pledges', numberOfPledges);
    console.log('Number of pledge admins', numberOfPledgeAdmins);

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
    const balance = projectBalanceMap.get(String(entity.projectId)) || [];
    // if (balance === undefined) {
    //   console.warn(`There is no balance for project ${String(entity.projectId)} in blockchain`);
    //   return;
    // }

    entity.donationCounters.forEach(dc => {
      const { symbol, currentBalance: dbBalance } = dc;
      const foreignAddress = tokenSymbolToForeignAddress[symbol];
      const blockchainBalance = balance[foreignAddress];

      if (blockchainBalance === undefined) {
        console.warn(
          `There is no balance for token ${symbol} in blockchain for ${model.modelName} ${entity._id}`,
        );
        return;
      }

      const dbBalanceFromWei = Web3.utils.fromWei(dbBalance.toString());
      const blockchainBalanceFromWei = Web3.utils.fromWei(blockchainBalance.toFixed(0));

      if (dbBalanceFromWei !== blockchainBalanceFromWei) {
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
      const { amount, owner } = pledge;
      const token = pledge.token.toLowerCase();

      if (!adminProjects.has(Number(owner))) {
        // console.warn(`owner ${owner} is not a project`);
        continue;
      }

      const balance = projectBalanceMap.get(owner) || {};
      const prevAmount = balance[token] || new BigNumber(0);
      balance[token] = prevAmount.plus(amount);
      projectBalanceMap.set(owner, balance);
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
