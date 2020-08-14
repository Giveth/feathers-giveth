const Web3 = require('web3');
const LPPCappedMilestoneArtifact = require('lpp-capped-milestone/build/LPPCappedMilestone.json');
const LPMilestoneArtifact = require('lpp-milestones/build/LPMilestone.json');
const BridgedMilestoneArtifact = require('lpp-milestones/build/BridgedMilestone.json');
const LiquidPledgingArtifact = require('giveth-liquidpledging/build/LiquidPledging.json');

const logger = require('winston');
const topicsFromArtifacts = require('../../src/blockchain/lib/topicsFromArtifacts');
const eventDecodersFromArtifact = require('../../src/blockchain/lib/eventDecodersFromArtifact');
const toWrapper = require('../../src/utils/to');

const configFileName = 'default'; // config file name

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
async function getEvent(web3, txHash) {
  const decoders = {
    ...eventDecodersFromArtifact(LPPCappedMilestoneArtifact),
    ...eventDecodersFromArtifact(LPMilestoneArtifact),
    ...eventDecodersFromArtifact(BridgedMilestoneArtifact),
    ...eventDecodersFromArtifact(LiquidPledgingArtifact),
  };
  const [err, receipt] = await toWrapper(web3.eth.getTransactionReceipt(txHash));

  if (err || !receipt) {
    logger.error('Error fetching transaction, or no tx receipt found ->', err, receipt);
    return undefined;
  }

  const topics = topicsFromArtifacts(
    [
      LiquidPledgingArtifact,
      LPPCappedMilestoneArtifact,
      LPMilestoneArtifact,
      BridgedMilestoneArtifact,
    ],
    [
      'ProjectAdded',
      'CancelProject',
      'MilestoneCompleteRequested',
      'MilestoneCompleteRequestRejected',
      'MilestoneCompleteRequestApproved',
      'MilestoneChangeReviewerRequested',
      'MilestoneReviewerChanged',
      'MilestoneChangeCampaignReviewerRequested',
      'MilestoneCampaignReviewerChanged',
      'MilestoneChangeRecipientRequested',
      'MilestoneRecipientChanged',
      'RequestReview',
      'RejectCompleted',
      'ApproveCompleted',
      'ReviewerChanged',
      'RecipientChanged',
      'PaymentCollected',
    ],
  );
  // get logs we're interested in.
  const logs = receipt.logs.filter(log => topics.some(t => t.hash === log.topics[0]));

  if (logs.length === 0) return undefined;

  const [log] = logs;
  // const { data } = log;
  // // Just keep homeTx
  // log.data = `0x${'0'.repeat(128)}${data.substring(130, 130 + 64)}${'0'.repeat(
  //   data.length - 2 - 128 - 64,
  // )}`;

  const topic = topics.find(t => t.hash === log.topics[0]);
  const event = decoders[topic.name](log);

  return event;
}

const main = async txHash => {
  const web3 = await instantiateWeb3(nodeUrl);
  return getEvent(web3, txHash);
};

const terminateScript = (message = '', code = 0) =>
  process.stdout.write(`${message}\n`, () => process.exit(code));

main(process.argv[2]).then(event => {
  if (event) terminateScript(`Event: ${JSON.stringify(event, null, 2)}`);
  else terminateScript('', 1);
});
