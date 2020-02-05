/* eslint-disable no-continue */
/* eslint-disable no-console */
const Web3 = require('web3');
const fs = require('fs');
const BigNumber = require('bignumber.js');
const { LiquidPledging, LiquidPledgingState } = require('giveth-liquidpledging');
const web3Helper = require('../../src/blockchain/lib/web3Helpers');

const configFileName = 'default'; // default or beta

// eslint-disable-next-line import/no-dynamic-require
const config = require(`../../config/${configFileName}.json`);

// Map token symbol to foreign address
const tokenForeignAddressToSymbol = {};
config.tokenWhitelist.forEach(token => {
  tokenForeignAddressToSymbol[token.foreignAddress.toLowerCase()] = token.symbol;
});

const { nodeUrl, liquidPledgingAddress } = config.blockchain;

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
const getBlockchainData = async readFromCache => {
  const cacheFile = `./liquidPledgingState_${configFileName}.json`;

  if (!readFromCache) {
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

    const [state] = await Promise.all([liquidPledgingState.getState()]);

    return state;
  }
  return JSON.parse(fs.readFileSync(cacheFile));
};

const main = async (projectId, useCache = false) => {
  const { pledges } = await getBlockchainData(useCache);

  // Donation counter map with projectId as key
  // const projectDonationCounterMap = new Map();
  // for (let i = 1; i < admins.length; i += 1) {
  //   if (['Delegate', 'Project'].includes(admins[i].type)) {
  //     projectDonationCounterMap.set(String(i), new Map());
  //   }
  // }

  const donationCounter = new Map();

  pledges.slice(1).forEach(pledge => {
    const { owner, delegates, pledgeState } = pledge;
    if (pledgeState !== 'Pledged') return;

    let ownerId;

    // If it's delegate to a dac
    if (delegates.length > 0) {
      const { intendedProject } = pledge;
      if (intendedProject !== '0' && intendedProject !== undefined) return;

      const [delegate] = delegates;
      ownerId = delegate.id;
    } else {
      ownerId = owner;
    }

    if (ownerId !== projectId) return;

    const { token, amount } = pledge;
    const amountRemaining = donationCounter.get(token) || new BigNumber(0);
    donationCounter.set(token, amountRemaining.plus(amount));
  });

  donationCounter.forEach((amountRemaining, token) => {
    const symbol = tokenForeignAddressToSymbol[token.toLowerCase()];
    console.log(
      `${token.toLowerCase()}(${symbol}): ${Web3.utils.fromWei(amountRemaining.toFixed())}`,
    );
  });
  process.stdout.write('', () => process.exit(0));
};

main(process.argv[2], false).then(() => {});
