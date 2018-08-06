/* eslint-disable consistent-return */

const { Kernel, AppProxyUpgradeable } = require('giveth-liquidpledging/build/contracts');
const { LPPCappedMilestone } = require('lpp-capped-milestone');
const { LPPCampaign } = require('lpp-campaign');
const { keccak256 } = require('web3-utils');
const logger = require('winston');

const { removeHexPrefix, getBlockTimestamp } = require('./lib/web3Helpers');
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
  async function getLppCampaignBase() {
    return getKernel().then(kernel =>
      kernel.getApp(keccak256(keccak256('base') + removeHexPrefix(keccak256('lpp-campaign')))),
    );
  }

  async function init() {
    if (initialized || (campaignBase && milestoneBase)) return;
    [campaignBase, milestoneBase] = await Promise.all([
      getLppCampaignBase(),
      getLppCappedMilestoneBase(),
    ]);
    initialized = true;
  }

  async function getCampaignById(projectId) {
    const data = await campaigns.find({ paginate: false, query: { projectId } });

    if (data.length === 0) {
      throw new Error("Campaign doesn't exist -> projectId:", projectId);
    }

    if (data.length > 1) {
      logger.info('more then 1 campaign with the same projectId found: ', data);
    }

    return data[0];
  }

  async function getMilestone(project, txHash, retry = false) {
    // const data = await milestones.find({ paginate: false, query: { txHash } });
    // TODO remove this once the txHash is never mutated.
    const data = await milestones.find({
      paginate: false,
      query: { $or: [{ pluginAddress: project.plugin }, { txHash }] },
    });
    if (data.length === 0) {
      // this is really only useful when instant mining. Other then that, the dac should always be
      // created before the tx was mined.
      if (!retry) {
        return reprocess(getMilestone.bind(this, project, txHash, true), 5000);
      }

      return;
    }

    if (data.length > 1) {
      logger.error('more then 1 milestone with the same txHash found: ', data);
    }

    return data[0];
  }

  async function createMilestone(project, projectId, milestone, tx) {
    const campaign = await getCampaignById(project.parentProject);

    if (!campaign) {
      logger.warn(
        "Ignoring addMilestone. Parent campaign doesn't exist -> projectId: ",
        project.parentProject,
      );
      return;
    }

    try {
      const date = await getBlockTimestamp(web3, tx.blockNumber);
      return milestones.create(
        {
          title: project.name,
          description: 'Missing Description... Added outside of UI',
          maxAmount: milestone.maxAmount,
          reviewerAddress: milestone.reviewer,
          recipientAddress: milestone.recipient,
          campaignReviewerAddress: milestone.campaignReviewer,
          campaignId: campaign._id,
          projectId,
          status: milestoneStatus(milestone.completed, milestone.canceled),
          ethConversionRateTimestamp: new Date(),
          selectedFiatType: 'ETH',
          date,
          fiatAmount: milestone.maxAmount,
          conversionRate: 1,
          txHash: tx.transactionHash,
          pluginAddress: project.plugin,
          totalDonated: '0',
          donationCount: 0,
          mined: true,
        },
        {
          eventTxHash: tx.transactionHash,
          performedByAddress: tx.from,
        },
      );
    } catch (err) {
      // milestones service will throw BadRequest error if reviewer/owner isn't whitelisted
      if (err.name === 'BadRequest') return;
      throw err;
    }
  }

  async function getCampaign(project, txHash, retry = false) {
    // const data = await campaigns.find({ paginate: false, query: { txHash } });
    // TODO remove this once the txHash is never mutated.
    const data = await campaigns.find({
      paginate: false,
      query: { $or: [{ pluginAddress: project.plugin }, { txHash }] },
    });
    // create a campaign if necessary
    if (data.length === 0) {
      // this is really only useful when instant mining. Other then that, the dac should always be
      // created before the tx was mined.
      if (!retry) {
        return reprocess(getCampaign.bind(this, project, txHash, true), 5000);
      }
      return;
    }

    if (data.length > 1) {
      logger.error('more then 1 campaign with the same title and ownerAddress found: ', data);
    }

    return data[0];
  }

  async function createCampaign(project, projectId, reviewerAddress, canceled, txHash) {
    const tx = await web3.eth.getTransaction(txHash);

    try {
      return campaigns.create({
        projectId,
        ownerAddress: tx.from,
        pluginAddress: project.plugin,
        reviewerAddress,
        title: project.name,
        image: '/',
        description: 'Missing Description... Added outside of UI',
        txHash,
        totalDonated: '0',
        donationCount: 0,
        status: canceled ? CampaignStatus.CANCELED : CampaignStatus.ACTIVE,
        mined: true,
      });
    } catch (err) {
      // campaigns service will throw BadRequest error if reviewer/owner isn't whitelisted
      if (err.name === 'BadRequest') return;
      throw err;
    }
  }

  async function addMilestone(project, projectId, txHash) {
    const cappedMilestone = new LPPCappedMilestone(web3, project.plugin);

    try {
      const responses = await Promise.all([
        getMilestone(project, txHash),
        cappedMilestone.maxAmount(),
        cappedMilestone.reviewer(),
        cappedMilestone.campaignReviewer(),
        cappedMilestone.recipient(),
        cappedMilestone.milestoneManager(),
        cappedMilestone.completed(),
        liquidPledging.isProjectCanceled(projectId),
        web3.eth.getTransaction(txHash),
      ]);
      let milestone = responses.splice(0, 1)[0];
      const [
        maxAmount,
        reviewer,
        campaignReviewer,
        recipient,
        manager,
        completed,
        canceled,
        tx,
      ] = responses;

      if (!milestone) {
        milestone = await createMilestone(
          project,
          projectId,
          {
            maxAmount,
            recipient,
            reviewer,
            campaignReviewer,
            ownerAddress: manager,
            completed,
            canceled,
          },
          tx,
        );

        if (milestone) return milestone;

        logger.warn(
          'Ignoring addMilestone. The campaign or milestone failed the whitelist check -> projectId:',
          projectId,
        );
        return;
      }

      return milestones.patch(
        milestone._id,
        {
          projectId,
          maxAmount,
          reviewerAddress: reviewer,
          campaignReviewerAddress: campaignReviewer,
          ownerAddress: manager,
          recipientAddress: recipient,
          title: project.name,
          pluginAddress: project.plugin,
          status: milestoneStatus(completed, canceled),
          mined: true,
        },
        {
          eventTxHash: txHash,
          performedByAddress: tx.from,
        },
      );
    } catch (error) {
      logger.error('addMilestone error: ', error);
    }
  }

  async function getMilestoneById(projectId) {
    const data = await milestones.find({ paginate: false, query: { projectId } });
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

  async function addCampaign(project, projectId, txHash) {
    const lppCampaign = new LPPCampaign(web3, project.plugin);

    try {
      const [campaign, canceled, reviewer] = await Promise.all([
        getCampaign(project, txHash),
        lppCampaign.isCanceled(),
        lppCampaign.reviewer(),
      ]);

      if (!campaign) {
        const c = await createCampaign(project, projectId, reviewer, canceled, txHash);

        if (c) return c;

        logger.warn('Ignoring addCampaign. Failed whitelist check -> projectId:', projectId);
        return;
      }

      return campaigns.patch(campaign._id, {
        projectId,
        title: project.name,
        reviewerAddress: reviewer,
        pluginAddress: project.plugin,
        status: canceled ? CampaignStatus.CANCELED : CampaignStatus.ACTIVE,
        mined: true,
      });
    } catch (err) {
      logger.error('addCampaign error ->', err);
    }
  }

  async function updateCampaign(project, projectId) {
    try {
      let campaign;
      try {
        campaign = await getCampaignById(projectId);
      } catch (err) {
        if (err.message.includes("Campaign doesn't exist")) {
          campaign = await addCampaign(project, projectId);
        } else {
          throw err;
        }
      }

      return campaigns.patch(campaign._id, {
        // ownerAddress: project.addr, // TODO project.addr is the campaign contract, need to fix
        title: project.name,
      });
    } catch (err) {
      logger.error('updateCampaign error ->', err);
    }
  }

  function getAdmin(adminId) {
    return app
      .service('pledgeAdmins')
      .find({ paginate: false, query: { id: adminId } })
      .then(data => data[0]);
  }

  async function getMostRecentDonationNotCanceled(donationId) {
    if (!donationId) throw new Error('donationId is missing, not sure what to do');

    const donation = await donations.get(donationId);

    // givers can never be canceled
    if (donation.ownerType === AdminTypes.GIVER && !donation.intendedProjectId) {
      return donation;
    }

    const pledgeOwnerAdmin = await getAdmin(donation.ownerId);

    // if pledgeOwnerAdmin is canceled or donation is a delegation, go back 1 donation
    if (
      [CampaignStatus.CANCELED, MilestoneStatus.CANCELED].includes(pledgeOwnerAdmin.admin.status) ||
      donation.intendedProjectId > 0
    ) {
      // we use the 1st parentDonation b/c the owner of all parentDonations
      // is the same
      return getMostRecentDonationNotCanceled(donation.parentDonations[0]);
    }

    return donation;
  }

  async function createToDonation(donation, txHash) {
    const revertToDonation = await getMostRecentDonationNotCanceled(donation._id);

    const newDonation = Object.assign({}, revertToDonation, {
      txHash,
      amountRemaining: donation.amountRemaining,
      canceledPledgeId: donation.pledgeId,
      parentDonations: [donation._id],
      isReturn: true,
      mined: true,
    });
    delete newDonation._id;

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
      mined: true,
    };

    const query = {
      campaignId,
      status: { $nin: [CANCELED, PAYING, PAID] },
    };

    const milestoneIds = (await milestones.patch(null, mutation, { query })).map(m => m._id);

    const donationQuery = {
      $or: [
        { ownerTypeId: { $in: milestoneIds } },
        { intendedProjectTypeId: { $in: milestoneIds } },
      ],
      status: { $nin: [DonationStatus.PAYING, DonationStatus.PAID] },
    };
    const donationsToRevert = await donations.find({ paginate: false, query: donationQuery });
    await Promise.all(donationsToRevert.map(donation => revertDonation(donation, txHash)));
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
    async setApp(event) {
      if (event.event !== 'SetApp') throw new Error('setApp only handles SetApp events');

      const { name } = event.returnValues;

      // when fetching the implementation, we will always receive the latest baseCode
      // when we get a SetApp event, ignore the event app, and re-fetch the current baseCode
      // since we synchronously process events,
      if (name === keccak256('lpp-capped-milestone')) {
        milestoneBase = await getLppCappedMilestoneBase();
      } else if (name === keccak256('lpp-campaign')) {
        campaignBase = await getLppCampaignBase();
      } else {
        logger.warn(`Ignoring unknown name in SetApp -> name:`, event.returnValues.name);
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
        const pledgeAdmin = await getAdmin(projectId);

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
          await cancelCampaignMilestones(pledgeAdmin.typeId, event.transactionHash);
        }

        // revert donations
        const query = {
          $or: [{ ownerTypeId: pledgeAdmin.typeId }, { intendedProjectTypeId: pledgeAdmin.typeId }],
          amountRemaining: { $ne: 0 },
        };
        try {
          const donationsToRevert = await donations.find({ paginate: false, query });
          await Promise.all(
            donationsToRevert.map(donation => revertDonation(donation, event.transactionHash)),
          );
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
