/* eslint-disable consistent-return */

const { Kernel, AppProxyUpgradeable } = require('giveth-liquidpledging/build/contracts');
const isIPFS = require('is-ipfs');
const { LPPCappedMilestone } = require('lpp-capped-milestone');
const { LPMilestone, BridgedMilestone } = require('lpp-milestones');
const { LPPCampaign } = require('lpp-campaign');
const { keccak256, isAddress } = require('web3-utils');
const logger = require('winston');

const {
  removeHexPrefix,
  getBlockTimestamp,
  executeRequestsAsBatch,
  ANY_TOKEN,
} = require('./lib/web3Helpers');
const { CampaignStatus } = require('../models/campaigns.model');
const { DonationStatus } = require('../models/donations.model');
const { MilestoneStatus, MilestoneTypes } = require('../models/milestones.model');
const { AdminTypes } = require('../models/pledgeAdmins.model');
const reprocess = require('../utils/reprocess');
const to = require('../utils/to');

const milestoneStatus = (state, completed, canceled) => {
  if (canceled) return MilestoneStatus.CANCELED;
  // new milestones have a state, old milestone don't
  if (state === undefined) {
    if (completed) return MilestoneStatus.COMPLETED;
    return MilestoneStatus.IN_PROGRESS;
  }

  if (state === '0') return MilestoneStatus.IN_PROGRESS;
  if (state === '1') return MilestoneStatus.NEEDS_REVIEW;
  if (state === '2') return MilestoneStatus.COMPLETED;
};

const projects = (app, liquidPledging) => {
  const web3 = app.getWeb3();
  const milestones = app.service('/milestones');
  const campaigns = app.service('/campaigns');
  const donations = app.service('donations');
  let initialized = false;

  let campaignBase;
  let lppCappedMilestoneBase;
  let lpMilestoneBase;
  let bridgedMilestoneBase;

  async function fetchProfile(url) {
    if (!url || url === '') return {};
    const [err, profile] = await to(app.ipfsFetcher(url));

    if (err) {
      logger.warn(`error fetching project profile from ${url}`, err);
    } else if (profile && typeof profile === 'object') {
      app.ipfsPinner(url);
      if (profile.image && isIPFS.ipfsPath(profile.image)) {
        app.ipfsPinner(profile.image);
      }
      if (profile.items) {
        profile.items
          .filter(i => i.image && isIPFS.ipfsPath(i.image))
          .forEach(i => app.ipfsPinner(i.image));
      }
    }
    return profile;
  }

  function findToken(foreignAddress) {
    if (foreignAddress === ANY_TOKEN.foreignAddress) return ANY_TOKEN;

    const tokenWhitelist = app.get('tokenWhitelist');

    const token = tokenWhitelist.find(
      t => t.foreignAddress.toLowerCase() === foreignAddress.toLowerCase(),
    );

    if (!token) throw new Error(`Un-whitelisted token: ${foreignAddress}`);

    return token;
  }

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
  async function getLppCampaignBase() {
    return getKernel().then(kernel =>
      kernel.getApp(keccak256(keccak256('base') + removeHexPrefix(keccak256('lpp-campaign')))),
    );
  }

  async function init() {
    if (
      initialized ||
      (campaignBase && lppCappedMilestoneBase && lpMilestoneBase && bridgedMilestoneBase)
    )
      return;
    [
      campaignBase,
      lppCappedMilestoneBase,
      lpMilestoneBase,
      bridgedMilestoneBase,
    ] = await Promise.all([
      getLppCampaignBase(),
      getLppCappedMilestoneBase(),
      getLPMilestoneBase(),
      getBridgedMilestoneBase(),
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
      const profile = await fetchProfile(project.url);
      return milestones.create(
        Object.assign(
          {
            title: project.name,
            description: 'Missing Description... Added outside of UI',
            fiatAmount: milestone.maxAmount === '0' ? undefined : milestone.maxAmount,
            selectedFiatType: milestone.token === ANY_TOKEN ? undefined : milestone.token.symbol,
            date,
            conversionRateTimestamp: milestone.maxAmount === '0' ? undefined : new Date(),
            conversionRate: milestone.maxAmount === '0' ? undefined : 1,
          },
          profile,
          {
            projectId,
            maxAmount: milestone.maxAmount === '0' ? undefined : milestone.maxAmount,
            reviewerAddress: milestone.reviewer,
            recipientAddress: isAddress(milestone.recipient) ? milestone.recipient : undefined,
            recipientId: !isAddress(milestone.recipient) ? milestone.recipient : undefined,
            campaignReviewerAddress: milestone.campaignReviewer,
            campaignId: campaign._id,
            txHash: tx.hash,
            pluginAddress: project.plugin,
            url: project.url,
            ownerAddress: milestone.ownerAddress,
            token: milestone.token,
            status: milestone.status,
            totalDonated: '0',
            currentBalance: '0',
            donationCount: 0,
            mined: true,
            type: milestone.type,
          },
        ),
        {
          eventTxHash: tx.hash,
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
        currentBalance: '0',
        donationCount: 0,
        status: canceled ? CampaignStatus.CANCELED : CampaignStatus.ACTIVE,
        commitTime: project.commitTime,
        url: project.url,
        mined: true,
      });
    } catch (err) {
      // campaigns service will throw BadRequest error if reviewer/owner isn't whitelisted
      if (err.name === 'BadRequest') return;
      throw err;
    }
  }

  async function addMilestone(project, projectId, txHash, type) {
    let milestoneContract;
    if (type === MilestoneTypes.LPPCappedMilestone) {
      milestoneContract = new LPPCappedMilestone(web3, project.plugin);
    } else if (type === MilestoneTypes.LPMilestone) {
      milestoneContract = new LPMilestone(web3, project.plugin);
    } else if (type === MilestoneTypes.BridgedMilestone) {
      milestoneContract = new BridgedMilestone(web3, project.plugin);
    } else {
      throw new Error('Unknown Milestone type ->', type);
    }

    const managerMethod = () =>
      type === MilestoneTypes.LPPCappedMilestone ? 'milestoneManager' : 'manager';
    const getCampaignReviewer = () =>
      type === MilestoneTypes.LPPCappedMilestone ? milestoneContract.campaignReviewer() : undefined;
    const getMilestoneCompleted = () =>
      type === MilestoneTypes.LPPCappedMilestone ? milestoneContract.completed() : undefined;
    const getMilestoneState = () =>
      type !== MilestoneTypes.LPPCappedMilestone ? milestoneContract.state() : undefined;

    try {
      const responses = await Promise.all([
        getMilestone(project, txHash),
        getCampaignReviewer(),
        milestoneContract.recipient(),
        getMilestoneCompleted(),
        getMilestoneState(),
        // batch what we can
        ...(await executeRequestsAsBatch(web3, [
          milestoneContract.$contract.methods.maxAmount().call.request,
          milestoneContract.$contract.methods.reviewer().call.request,
          milestoneContract.$contract.methods[managerMethod()]().call.request,
          milestoneContract.$contract.methods.acceptedToken().call.request,
          liquidPledging.$contract.methods.isProjectCanceled(projectId).call.request,
          web3.eth.getTransaction.request.bind(null, txHash),
        ])),
      ]);
      let milestone = responses.splice(0, 1)[0];
      const [
        campaignReviewer,
        recipient,
        completed,
        state,
        maxAmount,
        reviewer,
        manager,
        acceptedToken,
        canceled,
        tx,
      ] = responses;

      const token = findToken(acceptedToken);

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
            status: milestoneStatus(state, completed, canceled),
            type,
            token,
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

      const profile = await fetchProfile(project.url);
      const mutation = Object.assign({ title: project.name }, profile, {
        projectId,
        maxAmount: maxAmount === '0' ? undefined : maxAmount,
        reviewerAddress: reviewer,
        campaignReviewerAddress: campaignReviewer,
        ownerAddress: manager,
        recipientAddress: isAddress(recipient) ? recipient : undefined,
        recipientId: !isAddress(recipient) ? recipient : undefined,
        pluginAddress: project.plugin,
        status: milestoneStatus(state, completed, canceled),
        url: project.url,
        token,
        type,
        mined: true,
      });

      return milestones.patch(milestone._id, mutation, {
        eventTxHash: txHash,
        performedByAddress: tx.from,
      });
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

      const mutation = { title: project.name };
      if (project.url && project.url !== milestone.url) {
        const profile = fetchProfile(project.url);
        Object.assign(mutation, profile);
      }
      Object.assign(mutation, {
        // ownerAddress: project.addr, // TODO project.addr is the milestone contract, need to fix
        commitTime: project.commitTime,
        url: project.url,
      });

      return milestones.patch(milestone._id, mutation);
    } catch (err) {
      logger.error('updateMilestone error ->', err);
    }
  }

  async function addCampaign(project, projectId, txHash) {
    const lppCampaign = new LPPCampaign(web3, project.plugin);

    try {
      const [campaign, canceled, reviewer] = await Promise.all([
        getCampaign(project, txHash),
        ...(await executeRequestsAsBatch(web3, [
          lppCampaign.$contract.methods.isCanceled().call.request,
          lppCampaign.$contract.methods.reviewer().call.request,
        ])),
      ]);

      if (!campaign) {
        const c = await createCampaign(project, projectId, reviewer, canceled, txHash);

        if (c) return c;

        logger.warn('Ignoring addCampaign. Failed whitelist check -> projectId:', projectId);
        return;
      }

      const profile = fetchProfile(project.url);
      const mutation = Object.assign({ title: project.name }, profile, {
        projectId,
        reviewerAddress: reviewer,
        pluginAddress: project.plugin,
        commitTime: project.commitTime,
        status: canceled ? CampaignStatus.CANCELED : CampaignStatus.ACTIVE,
        url: project.url,
        mined: true,
      });

      return campaigns.patch(campaign._id, mutation);
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

      const mutation = { title: project.name };
      if (project.url && project.url !== campaign.url) {
        const profile = fetchProfile(project.url);
        Object.assign(mutation, profile);
      }
      Object.assign(mutation, {
        // ownerAddress: project.addr, // TODO project.addr is the campaign contract, need to fix
        commitTime: project.commitTime,
        url: project.url,
      });

      return campaigns.patch(campaign._id, mutation);
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

      if (!lppCappedMilestoneBase || !lpMilestoneBase || !bridgedMilestoneBase || !campaignBase) {
        logger.error(
          'missing milestone or campaign base',
          lppCappedMilestoneBase,
          lpMilestoneBase,
          bridgedMilestoneBase,
          campaignBase,
        );
      }
      if (baseCode === lppCappedMilestoneBase) {
        return addMilestone(project, projectId, txHash, MilestoneTypes.LPPCappedMilestone);
      }
      if (baseCode === lpMilestoneBase) {
        return addMilestone(project, projectId, txHash, MilestoneTypes.LPMilestone);
      }
      if (baseCode === bridgedMilestoneBase) {
        return addMilestone(project, projectId, txHash, MilestoneTypes.BridgedMilestone);
      }
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
        lppCappedMilestoneBase = await getLppCappedMilestoneBase();
      } else if (name === keccak256('lpp-lp-milestone')) {
        lpMilestoneBase = await getLPMilestoneBase();
      } else if (name === keccak256('lpp-bridged-milestone')) {
        bridgedMilestoneBase = await getBridgedMilestoneBase();
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
