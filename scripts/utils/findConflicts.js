const Web3 = require('web3');
const fs = require('fs');

const { LiquidPledging, LiquidPledgingState } = require('giveth-liquidpledging');
// const web3Helper = require('../../src/blockchain/lib/web3Helpers');

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

async function getPledgeAdmin(updateState) {
  let status;
  if (updateState) {
    const nodeUrl = 'wss://rinkeby.giveth.io/ws';
    const foreignWeb3 = instantiateWeb3(nodeUrl);
    const liquidPledging = new LiquidPledging(
      foreignWeb3,
      '0x8eB047585ABeD935a73ba4b9525213F126A0c979',
    );
    const liquidPledgingState = new LiquidPledgingState(liquidPledging);

    // const [numberOfPledges] = await web3Helper.executeRequestsAsBatch(foreignWeb3, [
    //   liquidPledging.$contract.methods.numberOfPledges().call.request,
    // ]);
    // console.log('Number of pledges', numberOfPledges);

    status = await liquidPledgingState.getState();

    fs.writeFileSync('liquidPledginState_beta.json', JSON.stringify(status, null, 2));
  } else {
    status = JSON.parse(fs.readFileSync('./liquidPledginState_beta.json'));
  }

  console.log('status.pledges.length', status.pledges.length);

  process.exit(0);
}

getPledgeAdmin(false);
