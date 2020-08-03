const Web3 = require('web3');
const ForeignGivethBridgeArtifact = require('giveth-bridge/build/ForeignGivethBridge.json');
const logger = require('winston');
const topicsFromArtifacts = require('../../src/blockchain/lib/topicsFromArtifacts');
const eventDecodersFromArtifact = require('../../src/blockchain/lib/eventDecodersFromArtifact');
const toWrapper = require('../../src/utils/to');

const configFileName = 'beta'; // default or beta

// eslint-disable-next-line import/no-dynamic-require
const config = require(`../../config/${configFileName}.json`);

const { nodeUrl } = config.blockchain;

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
async function getHomeTxHash(web3, txHash) {
  const decoders = eventDecodersFromArtifact(ForeignGivethBridgeArtifact);

  const [err, receipt] = await toWrapper(web3.eth.getTransactionReceipt(txHash));

  if (err || !receipt) {
    logger.error('Error fetching transaction, or no tx receipt found ->', err, receipt);
    return undefined;
  }

  const topics = topicsFromArtifacts([ForeignGivethBridgeArtifact], ['Deposit']);

  // get logs we're interested in.
  const logs = receipt.logs.filter(log => topics.some(t => t.hash === log.topics[0]));

  if (logs.length === 0) return undefined;

  const [log] = logs;
  const { data } = log;
  // Just keep homeTx
  log.data = `0x${'0'.repeat(128)}${data.substring(130, 130 + 64)}${'0'.repeat(
    data.length - 2 - 128 - 64,
  )}`;

  const topic = topics.find(t => t.hash === log.topics[0]);
  const event = decoders[topic.name](log);

  return event.returnValues.homeTx;
}

const main = async txHash => {
  if (!txHash || txHash === '') {
    // eslint-disable-next-line no-console
    console.log('txHash as argument is required');
    return null;
  }

  const web3 = await instantiateWeb3(nodeUrl);
  return getHomeTxHash(web3, txHash);
};

const terminateScript = (message = '', code = 0) =>
  process.stdout.write(`${message}\n`, () => process.exit(code));

main(process.argv[2]).then(homeTxHash => {
  if (homeTxHash) terminateScript(`Home Tx Hash: ${homeTxHash}`);
  else terminateScript('', 1);
});
