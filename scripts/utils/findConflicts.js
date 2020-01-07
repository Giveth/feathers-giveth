/* eslint-disable no-continue */
const Web3 = require('web3');
const fs = require('fs');
const BigNumber = require('bignumber.js');

const { LiquidPledging, LiquidPledgingState } = require('giveth-liquidpledging');
// const web3Helper = require('../../src/blockchain/lib/web3Helpers');

const foreignNodeUrl = 'ws://localhost:8546';
const liquidPledgingAddress = '0xBeFdf675cb73813952C5A9E4B84ea8B866DBA592';

function instantiateWeb3(nodeUrl) {
  const provider =
    nodeUrl && nodeUrl.startsWith('ws')
      ? new Web3.providers.WebsocketProvider(nodeUrl, {
          clientConfig: {
            maxReceivedFrameSize: 100000000,
            maxReceivedMessageSize: 100000000,
          },
        })
      : nodeUrl;
  return new Web3(provider);
}

async function getStatus(updateCache) {
  const cacheFile = './liquidPledgingState.json';
  let status;
  if (updateCache) {
    const foreignWeb3 = instantiateWeb3(foreignNodeUrl);
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
}

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
    console.log('project admins:', adminProjects);
    console.log('project balance:', projectBalanceMap);
  } catch (e) {
    console.log(e);
    throw e;
  }
};

main(false)
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
