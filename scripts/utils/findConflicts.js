const Web3 = require('web3');
const fs = require('fs');

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

async function getStatus(updateState) {
  const cacheFile = './liquidPledgingState.json';
  let status;
  if (updateState) {
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

getStatus(false)
  .then(status => {
    console.log('Number of pledges', status.pledges.length - 1);
    process.exit(0);
  })
  .catch(() => {
    process.exit(1);
  });
