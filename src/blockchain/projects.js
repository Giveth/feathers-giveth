/* eslint-disable consistent-return */

const { Kernel, AppProxyUpgradeable } = require('giveth-liquidpledging/build/contracts');
const { LPPCappedMilestone } = require('lpp-capped-milestone');
const { LPPCampaign } = require('lpp-campaign');
const logger = require('winston');

const ReprocessError = require('./lib/ReprocessError');
const { removeHexPrefix } = require('./lib/web3Helpers');
const { CampaignStatus } = require('../models/campaigns.model');
const { DonationStatus } = require('../models/donations.model');
const { MilestoneStatus } = require('../models/milestones.model');
const { AdminTypes } = require('../models/pledgeAdmins.model');
const reprocess = require('../utils/reprocess');

const milestoneStatus = (completed, canceled) => {
  if (canceled) return MilestoneStatus.CANCELED;
  if (completed) return MilestoneStatus.COMPLETED;
  return MilestoneStatus.IN_PROGRESS;
};

const projects = (app, liquidPledging) => {
  const web3 = app.getWeb3();
  const milestones = app.service('/milestones');
  const campaigns = app.service('/campaigns');
  const donations = app.service('donations');
  let initialized = false;

  let campaignBase;
  let milestoneBase;

  async function init() {
    if (campaignBase && milestoneBase) return;

    const { keccak256 } = web3.utils;

    const kernelAddress = await liquidPledging.kernel();
    const kernel = new Kernel(web3, kernelAddress);

    [campaignBase, milestoneBase] = await Promise.all([
      kernel.getApp(keccak256(keccak256('base') + removeHexPrefix(keccak256('lpp-campaign')))),
      kernel.getApp(
        keccak256(keccak256('base') + removeHexPrefix(keccak256('lpp-capped-milestone'))),
      ),
    ]);
    initialized = true;
  }

  async function getOrCreateCampaignById(projectId) {
    const data = await campaigns.find({ paginate: false, query: { projectId } });
    // create a campaign if necessary
    if (data.length === 0) {
      // TODO do we need to create an owner here?

      const campaignAdmin = await liquidPledging.getPledgeAdmin(projectId);
      return campaigns.create({
        ownerAddress: campaignAdmin.addr,
        title: campaignAdmin.name,
        projectId,
        totalDonated: '0',
        donationCount: 0,
      });
    }

    if (data.length > 1) {
      logger.info('more then 1 campaign with the same projectId found: ', data);
    }

    return data[0];
  }

  async function getOrCreateMilestone(project, txHash, retry) {
    const data = await milestones.find({ query: { txHash } });
    if (data.length === 0) {
      // this is really only useful when instant mining. Other then that, the dac should always be
      // created before the tx was mined.
      if (!retry) throw new ReprocessError();

      const [campaign, tx] = Promise.all([
        getOrCreateCampaignById(project.parentProject),
        web3.eth.getTransaction(txHash),
      ]);

      try {
        return milestones.create({
          ownerAddress: tx.from,
          pluginAddress: project.plugin,
          reviewerAddress: '0x0000000000000000000000000000000000000000', // these will be set in the patch
          campaignReviewerAddress: '0x0000000000000000000000000000000000000000',
          title: project.name,
          description: '',
          txHash,
          campaignId: campaign.id,
          totalDonated: '0',
          donationCount: 0,
        });
      } catch (err) {
        // milestones service will throw BadRequest error if reviewer/owner isn't whitelisted
        if (err.name === 'BadRequest') return;
        throw err;
      }
    }

    if (data.length > 1) {
      logger.error('more then 1 milestone with the same txHash found: ', data);
    }

    return data[0];
  }

  async function getOrCreateCampaign(project, txHash, retry) {
    const data = await campaigns.find({ query: { txHash } });
    // create a campaign if necessary
    if (data.length === 0) {
      // this is really only useful when instant mining. Other then that, the dac should always be
      // created before the tx was mined.
      if (!retry) throw new ReprocessError();

      const lppCampaign = new LPPCampaign(web3, project.plugin);

      const [tx, reviewerAddress] = Promise.all([
        web3.eth.getTransaction(txHash),
        lppCampaign.reviewer(),
      ]);
      try {
        return campaigns.create({
          ownerAddress: tx.from,
          pluginAddress: project.plugin,
          reviewerAddress,
          title: project.name,
          description: '',
          txHash,
          totalDonated: '0',
          donationCount: 0,
        });
      } catch (err) {
        // campaigns service will throw BadRequest error if reviewer/owner isn't whitelisted
        if (err.name === 'BadRequest') return;
        throw err;
      }
    }

    if (data.length > 1) {
      logger.error('more then 1 campaign with the same title and ownerAddress found: ', data);
    }

    return data[0];
  }

  async function addMilestone(project, projectId, txHash, retry = false) {
    const cappedMilestone = new LPPCappedMilestone(web3, project.plugin);

    try {
      const [
        milestone,
        maxAmount,
        reviewer,
        campaignReviewer,
        recipient,
        completed,
        canceled,
      ] = await Promise.all([
        getOrCreateMilestone(project, txHash, retry),
        cappedMilestone.maxAmount(),
        cappedMilestone.reviewer(),
        cappedMilestone.campaignReviewer(),
        cappedMilestone.recipient(),
        cappedMilestone.completed(),
        liquidPledging.isProjectCanceled(projectId),
      ]);

      return milestones.patch(
        milestone._id,
        {
          projectId,
          maxAmount,
          reviewerAddress: reviewer,
          campaignReviewerAddress: campaignReviewer,
          recipientAddress: recipient,
          title: project.name,
          pluginAddress: project.plugin,
          status: milestoneStatus(completed, canceled),
          mined: true,
          performedByAddress: milestone.ownerAddress,
        },
        { eventTxHash: txHash },
      );
    } catch (error) {
      if (error instanceof ReprocessError) {
        return reprocess(addMilestone.bind(project, projectId, txHash, true), 5000);
      }
      logger.error('addMilestone error: ', error);
    }
  }

  async function getMilestoneById(projectId) {
    const data = await milestones.find({ query: { projectId } });
    if (data.length === 0) return;

    if (data.length > 1) {
      logger.info('more then 1 milestone with the same projectId found: ', data);
    }

    return data[0];
  }

  async function updateMilestone(project, projectId) {
    try {
      let milestone = await getMilestoneById(projectId);
      if (!milestone) {
        milestone = await addMilestone(project, projectId);
      }
      return milestones.patch(milestone._id, {
        // ownerAddress: project.addr, // TODO project.addr is the milestone contract, need to fix
        title: project.name,
      });
    } catch (err) {
      logger.error('updateMilestone error ->', err);
    }
  }

  async function addCampaign(project, projectId, txHash, retry = false) {
    const lppCampaign = new LPPCampaign(web3, project.plugin);

    try {
      const [campaign, canceled, reviewer] = Promise.all([
        getOrCreateCampaign(project, txHash, retry),
        lppCampaign.isCanceled(),
        lppCampaign.reviewer(),
      ]);

      return campaigns.patch(campaign._id, {
        projectId,
        title: project.name,
        reviewerAddress: reviewer,
        pluginAddress: project.plugin,
        status: canceled ? CampaignStatus.CANCELED : CampaignStatus.ACTIVE,
        mined: true,
      });
    } catch (err) {
      if (err instanceof ReprocessError) {
        return reprocess(addCampaign.bind(project, projectId, txHash, true), 5000);
      }
      logger.error('addCampaign error ->', err);
    }
  }

  async function getCampaignById(projectId) {
    const data = await campaigns.find({ query: { projectId } });
    if (data.length === 0) return;

    if (data.length > 1) {
      logger.info('more then 1 campaign with the same projectId found: ', data);
    }

    return data[0];
  }

  async function updateCampaign(project, projectId) {
    try {
      let campaign = await getCampaignById(projectId);

      if (!campaign) {
        campaign = await addCampaign(project, projectId);
      }

      return campaigns.patch(campaign._id, {
        // ownerAddress: project.addr, // TODO project.addr is the campaign contract, need to fix
        title: project.name,
      });
    } catch (err) {
      logger.error('updateCampaign error ->', err);
    }
  }

  async function getAdmin(adminId) {
    return app.service('pledgeAdmins').get(adminId);
  }

  async function getMostRecentDonationNotCanceled(donationId) {
    if (!donationId) throw new Error('donationId is missing, not sure what to do');

    const donation = await donations.get(donationId);

    // givers can never be canceled
    if (donation.ownerType === AdminTypes.GIVER) {
      return donation;
    }

    const pledgeOwnerAdmin = await getAdmin(donation.ownerId);

    // if pledgeOwnerAdmin is canceled or donation is a delegation, go back 1 donation
    if (
      [CampaignStatus.CANCELED, MilestoneStatus.CANCELED].includes(pledgeOwnerAdmin.admin.status) ||
      Number(donation.intendedProjectId) > 0
    ) {
      // we use the 1st parentDonation b/c the owner of all parentDonations
      // is the same
      return getMostRecentDonationNotCanceled(donation.parentDonations[0]);
    }

    return donation;
  }

  function createToDonation(donation, txHash) {
    const revertToDonation = getMostRecentDonationNotCanceled(donation._id);

    const newDonation = Object.assign({}, revertToDonation, {
      txHash,
      amountRemaining: donation.amountRemaining,
      // we use this b/c lp will normalize the pledge before transferring
      pledgeId: donation.pledgeId,
      isReturn: true,
    });

    return donations.create(newDonation);
  }

  // revert donation b/c a project was canceled
  async function revertDonation(donation, txHash) {
    try {
      const mutation = {
        status: DonationStatus.CANCELED,
        amountRemaining: '0',
      };

      await donations.patch(donation._id, mutation);
      return createToDonation(donation, txHash);
    } catch (err) {
      logger.error(err);
    }
  }

  async function cancelCampaignMilestones(campaignId, txHash) {
    const { CANCELED, PAYING, PAID } = MilestoneStatus;
    // cancel all milestones
    const mutation = {
      status: CANCELED,
      // mined: true,
      // txHash,
    };

    const query = {
      campaignId,
      status: { $nin: [CANCELED, PAYING, PAID] },
    };

    const milestoneIds = await milestones.patch(null, mutation, { query }).map(m => m._id);

    const donationQuery = {
      $or: [{ ownerTypeId: { $in: milestoneIds } }, { intendedProjectTypeId: { $in: milestoneIds } }],
      status: { $nin: [DonationStatus.PAYING, DonationStatus.PAID] },
    };
    donations
      .find({ paginate: false, query: donationQuery })
      .forEach(donation => revertDonation(donation, txHash));
  }

  return {
    /**
     * handle `ProjectAdded` events
     *
     * @param {object} event Web3 event object
     * @returns {object|undefined} added project
     */
    async addProject(event) {
      if (event.event !== 'ProjectAdded') {
        throw new Error('addProject only handles ProjectAdded events');
      }

      const projectId = event.returnValues.idProject;
      const txHash = event.transactionHash;

      if (!initialized) await init();

      const project = await liquidPledging.getPledgeAdmin(projectId);
      const baseCode = await new AppProxyUpgradeable(web3, project.plugin).implementation();

      if (!milestoneBase || !campaignBase) {
        logger.error('missing milestone or campaign base', milestoneBase, campaignBase);
      }
      if (baseCode === milestoneBase) return addMilestone(project, projectId, txHash);
      if (baseCode === campaignBase) return addCampaign(project, projectId, txHash);

      logger.error('AddProject event with unknown plugin baseCode ->', event, baseCode);
    },

    /**
     * handle `ProjectUpdated` events
     *
     * @param {object} event Web3 event object
     * @returns {object|undefined} added project
     */
    async updateProject(event) {
      if (event.event !== 'ProjectUpdated') {
        throw new Error('updateProject only handles ProjectUpdated events');
      }

      const projectId = event.returnValues.idProject;

      const project = await liquidPledging.getPledgeAdmin(projectId);

      // we make the assumption that if there is a parentProject, then the
      // project is a milestone, otherwise it is a campaign
      return project.parentProject > 0
        ? updateMilestone(project, projectId)
        : updateCampaign(project, projectId);
    },

    /**
     * handle `SetApp` events
     *
     * @param {object} event Web3 event object
     */
    setApp(event) {
      if (event.event !== 'SetApp') throw new Error('setApp only handles SetApp events');

      const { name, app: addy } = event.returnValues;
      const { keccak256 } = web3.utils;

      if (name === keccak256('lpp-capped-milestone')) {
        milestoneBase = addy;
      } else if (name === keccak256('lpp-campaign')) {
        campaignBase = addy;
      } else {
        logger.warn(`Unkonwn name in SetApp event:`, event);
      }
    },

    /**
     * handle `CancelProject` events
     *
     * @param {object} event Web3 event object
     */
    async cancelProject(event) {
      if (event.event !== 'CancelProject') {
        throw new Error('cancelProject only handles CancelProject events');
      }

      const projectId = event.returnValues.idProject;

      try {
        const pledgeAdmin = await app.service('pledgeAdmins').get(projectId);

        const [service, status] =
          pledgeAdmin.type === AdminTypes.CAMPAIGN
            ? [campaigns, CampaignStatus.CANCELED]
            : [milestones, MilestoneStatus.CANCELED];

        // update admin entity
        await service.patch(
          pledgeAdmin.typeId,
          {
            status,
            mined: true,
          },
          { eventTxHash: event.transactionHash },
        );

        if (pledgeAdmin.type === AdminTypes.CAMPAIGN) {
          cancelCampaignMilestones(pledgeAdmin.typeId);
        }

        // revert donations
        const query = {
          $or: [{ ownerTypeId: pledgeAdmin.typeId }, { intendedProjectTypeId: pledgeAdmin.typeId }],
          amountRemaining: { $ne: '0' },
        };
        try {
          donations
            .find({ paginate: false, query })
            .forEach(donation => revertDonation(donation, event.transactionHash));
        } catch (error) {
          logger.error(error);
        }
      } catch (error) {
        if (error.name === 'NotFound') return;
        logger.error(error);
      }
    },
  };
};

module.exports = projects;
