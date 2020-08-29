const Web3 = require('web3');
const { LiquidPledging } = require('giveth-liquidpledging');

const configFileName = 'default'; // default or beta

// eslint-disable-next-line import/no-dynamic-require
const config = require(`../../config/${configFileName}.json`);

const { nodeUrl, liquidPledgingAddress } = config.blockchain;

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

const foreignWeb3 = instantiateWeb3(
  nodeUrl.startsWith('ws')
    ? nodeUrl.replace('wss://', 'http://').replace('ws://', 'http://')
    : nodeUrl,
);

/**
  Utility method to get a single pledge from liquidPledging

  Usage: node getPledge [pledgeId]
* */

async function getPledge(pledgeId) {
  const liquidPledging = new LiquidPledging(foreignWeb3, liquidPledgingAddress);

  const pledge = await liquidPledging.getPledge(pledgeId);
  console.log('pledge', pledge);
}

getPledge(process.argv[2]);
