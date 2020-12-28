const Web3 = require('web3');
const { Kernel, LiquidPledging } = require('giveth-liquidpledging');
const { LPMilestone, BridgedMilestone } = require('lpp-milestones');
const { LPPCappedMilestone } = require('lpp-capped-milestone');
const { AppProxyUpgradeable } = require('giveth-liquidpledging/build/contracts');
const { removeHexPrefix, executeRequestsAsBatch } = require('../../src/blockchain/lib/web3Helpers');

const liquidPledgingAddress = '0x8eB047585ABeD935a73ba4b9525213F126A0c979';

const web3 = new Web3('https://rinkeby2.giveth.io');
console.log('web3.versoin:', web3.version);
const { keccak256 } = web3.utils;
const liquidPledging = new LiquidPledging(web3, liquidPledgingAddress);

async function getKernel() {
  const kernelAddress = await liquidPledging.kernel();
  return new Kernel(web3, kernelAddress);
}
async function getLppCappedMilestoneBase() {
  return getKernel().then(kernel =>
    kernel.getApp(
      keccak256(keccak256('base') + removeHexPrefix(keccak256('lpp-capped-milestone'))),
    ),
  );
}
async function getLPMilestoneBase() {
  return getKernel().then(kernel =>
    kernel.getApp(keccak256(keccak256('base') + removeHexPrefix(keccak256('lpp-lp-milestone')))),
  );
}
async function getBridgedMilestoneBase() {
  return getKernel().then(kernel =>
    kernel.getApp(
      keccak256(keccak256('base') + removeHexPrefix(keccak256('lpp-bridged-milestone'))),
    ),
  );
}
// eslint-disable-next-line no-unused-vars
async function getLppCampaignBase() {
  return getKernel().then(kernel =>
    kernel.getApp(keccak256(keccak256('base') + removeHexPrefix(keccak256('lpp-campaign')))),
  );
}
/**
 Utility method to get a single pledge from liquidPledging

 Usage: node getPledge [pledgeId]
 * */

const MilestoneTypes = {
  LPPCappedMilestone: 'LPPCappedMilestone',
  BridgedMilestone: 'BridgedMilestone',
  LPMilestone: 'LPMilestone',
};

// eslint-disable-next-line consistent-return
async function getMilestone(plugin) {
  const baseCode = await new AppProxyUpgradeable(web3, plugin).implementation();

  const [lppCappedMilestoneBase, lpMilestoneBase, bridgedMilestoneBase] = await Promise.all([
    getLppCappedMilestoneBase(),
    getLPMilestoneBase(),
    getBridgedMilestoneBase(),
  ]);

  const printMilestone = async (pluginAddress, type) => {
    let milestoneContract;
    if (type === MilestoneTypes.LPPCappedMilestone) {
      milestoneContract = new LPPCappedMilestone(web3, pluginAddress);
    } else if (type === MilestoneTypes.LPMilestone) {
      milestoneContract = new LPMilestone(web3, pluginAddress);
    } else if (type === MilestoneTypes.BridgedMilestone) {
      milestoneContract = new BridgedMilestone(web3, pluginAddress);
    }

    const responses = await Promise.all([
      ...(await executeRequestsAsBatch(web3, [
        milestoneContract.$contract.methods.maxAmount().call.request,
        milestoneContract.$contract.methods.acceptedToken().call.request,
      ])),
    ]);
    const [maxAmount, acceptedToken] = responses;

    console.log('Max Amount:', web3.utils.fromWei(maxAmount));
    console.log('Accepted Token:', acceptedToken);
  };

  if (baseCode === lppCappedMilestoneBase) {
    return printMilestone(plugin, MilestoneTypes.LPPCappedMilestone);
  }
  if (baseCode === lpMilestoneBase) {
    return printMilestone(plugin, MilestoneTypes.LPMilestone);
  }
  if (baseCode === bridgedMilestoneBase) {
    return printMilestone(plugin, MilestoneTypes.BridgedMilestone);
  }
}

getMilestone(process.argv[2]);
