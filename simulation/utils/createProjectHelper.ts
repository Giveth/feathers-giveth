import { keccak256 } from 'web3-utils';
import { LPPCappedMilestone } from 'lpp-capped-milestone';
import { LPMilestone, BridgedMilestone } from 'lpp-milestones';
import { LPPCampaign } from 'lpp-campaign';
import { isAddress } from 'web3-utils';
import {
  removeHexPrefix,
  executeRequestsAsBatch,
  getBlockTimestamp,
  ANY_TOKEN,
} from './web3Helpers';
import { MilestoneTypes } from '../models/milestones.model';
import { getTokenByForeignAddress } from './tokenUtility';
import { ProjectInterface } from './interfaces';

export function createProjectHelper({ web3, liquidPledging, kernel, AppProxyUpgradeable }) {
  let baseCodeData;

  const getMilestoneAndCampaignBaseCodes = async () => {
    if (!baseCodeData) {
      const [
        campaignBase,
        lppCappedMilestoneBase,
        lpMilestoneBase,
        bridgedMilestoneBase,
      ] = await Promise.all([
        kernel.getApp(keccak256(keccak256('base') + removeHexPrefix(keccak256('lpp-campaign')))),
        kernel.getApp(
          keccak256(keccak256('base') + removeHexPrefix(keccak256('lpp-capped-milestone'))),
        ),
        kernel.getApp(
          keccak256(keccak256('base') + removeHexPrefix(keccak256('lpp-lp-milestone'))),
        ),
        kernel.getApp(
          keccak256(keccak256('base') + removeHexPrefix(keccak256('lpp-bridged-milestone'))),
        ),
      ]);
      baseCodeData = {
        campaignBase,
        lppCappedMilestoneBase,
        lpMilestoneBase,
        bridgedMilestoneBase,
      };
    }
    return baseCodeData;
  };

  const managerMethod = (milestoneType: string) =>
    milestoneType === MilestoneTypes.LPPCappedMilestone ? 'milestoneManager' : 'manager';

  const getCampaignReviewer = (options: { milestoneType: string, milestoneContract: any }) => {
    const { milestoneType, milestoneContract } = options;
    milestoneType === MilestoneTypes.LPPCappedMilestone
      ? milestoneContract.campaignReviewer()
      : undefined;
  };


  const getMilestoneContract = (data: { milestoneType: string, projectPlugin: string }) => {
    const { milestoneType, projectPlugin } = data;
    switch (milestoneType) {
      case MilestoneTypes.LPPCappedMilestone:
        return new LPPCappedMilestone(web3, projectPlugin);
      case MilestoneTypes.LPMilestone:
        return new LPMilestone(web3, projectPlugin);
      case MilestoneTypes.BridgedMilestone:
        return new BridgedMilestone(web3, projectPlugin);
      default:
        throw new Error('Unknown Milestone type ->' + milestoneType);
    }
  };

  return {
    getMilestoneTypeByProjectId: async (projectId: string) => {
      const project = await liquidPledging.getPledgeAdmin(projectId);
      const baseCode = await new AppProxyUpgradeable(web3, project.plugin).implementation();
      const {
        campaignBase,
        lppCappedMilestoneBase,
        lpMilestoneBase,
        bridgedMilestoneBase,
      } = await getMilestoneAndCampaignBaseCodes();
      let isCampaign;
      let milestoneType;
      // eslint-disable-next-line default-case
      switch (baseCode) {
        case bridgedMilestoneBase:
          isCampaign = false;
          milestoneType = MilestoneTypes.BridgedMilestone;
          break;

        case lpMilestoneBase:
          isCampaign = false;
          milestoneType = MilestoneTypes.LPMilestone;
          break;

        case lppCappedMilestoneBase:
          isCampaign = false;
          milestoneType = MilestoneTypes.LPPCappedMilestone;
          break;

        case campaignBase:
          isCampaign = true;
          break;
      }

      // if isCampaign be true then milestoneType should be undefined and conversely
      return {
        isCampaign,
        milestoneType,
        project,
      };
    },

    getMilestoneDataForCreate: async (options: {
      milestoneType: string,
      project: ProjectInterface,
      projectId: string,
      txHash: string
    }) => {
      const { milestoneType, project, projectId, txHash } = options;
      const milestoneContract = getMilestoneContract({
        milestoneType,
        projectPlugin: project.plugin,
      });
      const responses = await Promise.all([
        getCampaignReviewer({ milestoneType, milestoneContract }),
        milestoneContract.recipient(),
        // batch what we can
        ...(await executeRequestsAsBatch(web3, [
          milestoneContract.$contract.methods.maxAmount().call.request,
          milestoneContract.$contract.methods.reviewer().call.request,
          milestoneContract.$contract.methods[managerMethod(milestoneType)]().call.request,
          milestoneContract.$contract.methods.acceptedToken().call.request,
          web3.eth.getTransaction.request.bind(null, txHash),
        ])),
      ]);
      const [
        campaignReviewer,
        recipient,
        maxAmount,
        reviewer,
        manager,
        acceptedToken,
        tx,
      ] = responses;
      const token = getTokenByForeignAddress(acceptedToken);
      if (!token) throw new Error(`Un-whitelisted token: ${acceptedToken}`);
      const date = await getBlockTimestamp(web3, tx.blockNumber);

      return {
        title: project.name,
        description: 'Missing Description... Added outside of UI',
        fiatAmount: maxAmount === '0' ? undefined : Number(maxAmount) / 10 ** 18,
        selectedFiatType: token.symbol === ANY_TOKEN.symbol ? undefined : token.symbol,
        date,
        conversionRateTimestamp: maxAmount === '0' ? undefined : new Date(),
        conversionRate: maxAmount === '0' ? undefined : 1,
        projectId,
        maxAmount: maxAmount === '0' ? undefined : maxAmount,
        reviewerAddress: reviewer,
        recipientAddress: isAddress(recipient) ? recipient : undefined,
        recipientId: !isAddress(recipient) ? recipient : undefined,
        campaignReviewerAddress: campaignReviewer,
        txHash: tx.hash,
        pluginAddress: project.plugin,
        url: project.url,
        ownerAddress: manager,
        tokenAddress: token.address,
        totalDonated: '0',
        currentBalance: '0',
        donationCount: 0,
        mined: true,
        type: milestoneType,
      };
    },

    getCampaignDataForCreate: async (options: {
      project: ProjectInterface, projectId: string, txHash: string
    }) => {
      const { project, projectId, txHash } = options;
      const lppCampaign = new LPPCampaign(web3, project.plugin);

      const [reviewerAddress] = await executeRequestsAsBatch(web3, [
        lppCampaign.$contract.methods.reviewer().call.request,
      ]);
      const { from } = await web3.eth.getTransaction(txHash);
      return {
        projectId,
        ownerAddress: from,
        coownerAddress: '0x0',
        fundsForwarder: '0x0',
        pluginAddress: project.plugin,
        reviewerAddress,
        title: project.name,
        image: '/',
        description: 'Missing Description... Added outside of UI',
        txHash,
        totalDonated: '0',
        currentBalance: '0',
        donationCount: 0,
        commitTime: project.commitTime,
        url: project.url,
        mined: true,
      };
    },
  };
}
