/* eslint-disable consistent-return */
const logger = require('winston');
const { toBN } = require('web3-utils');
const { getBlockTimestamp } = require('./lib/web3Helpers');
const { CampaignStatus } = require('../models/campaigns.model');
const { DonationStatus } = require('../models/donations.model');
const { MilestoneStatus } = require('../models/milestones.model');
const { AdminTypes } = require('../models/pledgeAdmins.model');
const toWrapper = require('../utils/to');
const reprocess = require('../utils/reprocess');

/**
 * @param {object} transferInfo
 */
const isCommittedDelegation = ({ fromPledge, toPledge }) =>
  Number(fromPledge.intendedProject) > 0 && fromPledge.intendedProject === toPledge.owner;

/**
 * @param {object} transferInfo
 */
const isRejectedDelegation = ({ fromPledge, toPledge }) =>
  Number(fromPledge.intendedProject) > 0 && fromPledge.intendedProject !== toPledge.owner;

/**
 * @param {object} transferInfo
 */
const isDelegation = ({ intendedProject }) => !!intendedProject;

const getDonationStatus = transferInfo => {
  const { toPledgeAdmin, delegate } = transferInfo;
  const { pledgeState } = transferInfo.toPledge;
  if (pledgeState === '1') return DonationStatus.PAYING;
  if (pledgeState === '2') return DonationStatus.PAID;
  if (isDelegation(transferInfo)) return DonationStatus.TO_APPROVE;
  if (toPledgeAdmin.type === AdminTypes.GIVER || !!delegate) return DonationStatus.WAITING;
  return DonationStatus.COMMITTED;
};

/**
 * @param {number|string} commitTime liquidPledging `commitTime`
 * @param {number} ts default commitTime
 */
const getCommitTime = (commitTime, ts) =>
  // * 1000 is to convert evm ts to js ts
  Number(commitTime) > 0 ? new Date(commitTime * 1000) : ts;

/**
 * generate a mutation object used to create/update the `to` donation
 *
 * @param {object} transferInfo object containing information regarding the Transfer event
 */
function createToDonationMutation(transferInfo, isReturnTransfer) {
  const {
    toPledgeAdmin,
    toPledge,
    toPledgeId,
    delegate,
    intendedProject,
    donations,
    amount,
    ts,
  } = transferInfo;

  const mutation = {
    amount,
    amountRemaining: amount,
    giverAddress: donations[0].giverAddress, // all donations should have same giverAddress
    ownerId: toPledge.owner,
    ownerTypeId: toPledgeAdmin.typeId,
    ownerType: toPledgeAdmin.type,
    pledgeId: toPledgeId,
    commitTime: getCommitTime(toPledge.commitTime, ts),
    status: getDonationStatus(transferInfo),
    parentDonations: donations.map(d => d._id),
  };

  if (delegate) {
    Object.assign(mutation, {
      delegateId: delegate.id,
      delegateTypeId: delegate.typeId,
      delegateType: delegate.type,
    });
  }

  if (intendedProject) {
    Object.assign(mutation, {
      intendedProjectId: intendedProject.id,
      intendedProjectTypeId: intendedProject.typeId,
      intendedProjectType: intendedProject.type,
    });
  }

  if (isReturnTransfer || isRejectedDelegation(transferInfo)) {
    mutation.isReturn = true;
  }

  return mutation;
}

/**
 *
 * @param {object} app feathers app instance
 * @param {object} liquidPledging liquidPledging contract instance
 */
const pledges = (app, liquidPledging) => {
  const web3 = app.getWeb3();
  const donationService = app.service('donations');
  const pledgeAdmins = app.service('pledgeAdmins');

  /**
   * fetch donations for a pledge needed to fulfill the transfer amount
   *
   * lp will aggregate multiple donations by the same person to another entity
   * into a single pledge. We keep them separated by donation. Here we fetch
   * all donations needed to fulfill the amount being transferred from the pledge.
   * Donations are spent in a FIFO order.
   *
   * @param {number|string} pledgeId lp pledgeId
   * @param {number|string} amount amount that is being transferred
   */
  async function getDonations(pledgeId, amount) {
    const donations = await donationService.find({
      paginate: false,
      schema: 'includeTypeAndGiverDetails',
      query: {
        $sort: { createdAt: 1 },
        pledgeId,
        amountRemaining: { $ne: 0 },
      },
    });
    let remaining = toBN(amount);

    return donations.filter(d => {
      if (remaining.gtn(0)) {
        remaining = remaining.sub(toBN(d.amountRemaining));
        return true;
      }
      return false;
    });
  }

  function getPledgeAdmin(id) {
    return pledgeAdmins.find({ paginate: false, query: { id } }).then(data => data[0]);
  }

  async function createDonation(mutation, txHash, retry = false) {
    const donations = await donationService.find({
      paginate: false,
      $limit: 1,
      query: {
        txHash,
        amount: mutation.amount,
        $or: [{ pledgeId: { $exists: false } }, { pledgeId: '0' }, { pledgeId: mutation.pledgeId }],
      },
    });

    if (donations.length === 0) {
      // if this is the second attempt, then create a donation object
      // otherwise, try and process the event later, giving time for
      // the donation entity to be created via REST api first
      // this is really only useful when instant mining. and re-syncing feathers w/ past events.
      // Other then that, the donation should always be created before the tx was mined.
      return retry
        ? donationService.create(Object.assign(mutation, { txHash }))
        : reprocess(createDonation.bind(this, mutation, txHash, true), 5000);
    }

    return donationService.patch(donations[0]._id, mutation);
  }

  async function newDonation(pledgeId, amount, txHash) {
    const pledge = await liquidPledging.getPledge(pledgeId);
    const giver = await getPledgeAdmin(pledge.owner);

    const mutation = {
      giverAddress: giver.admin.address, // giver is a user type
      amount,
      amountRemaining: amount,
      pledgeId,
      ownerId: pledge.owner,
      ownerTypeId: giver.typeId,
      ownerType: giver.type,
      status: DonationStatus.WAITING, // waiting for delegation by owner
    };

    return createDonation(mutation, txHash);
  }

  /**
   * Determine if this transfer was a return of excess funds of an over-funded milestone
   * @param {object} transferInfo
   */
  async function isReturnTransfer(transferInfo) {
    const { fromPledgeAdmin, toPledgeId, txHash, donations } = transferInfo;
    // currently only milestones will can be over-funded
    if (!fromPledgeAdmin.type === AdminTypes.MILESTONE) return false;

    const from = donations[0].pledgeId; // all donations will have same pledgeId
    const transferEventsInTx = await app
      .service('events')
      .find({ paginate: false, query: { txHash, event: 'Transfer' } });

    // ex events in return case:
    // Transfer(from: 1, to: 2, amount: 1000)
    // Transfer(from: 2, to: 1, amount: < 1000)
    return transferEventsInTx.some(
      e => e.returnValues.from === toPledgeId && e.returnValues.to === from,
    );
  }

  /**
   * create a new donation for the `to` pledge
   *
   * @param {object} transferInfo
   */
  async function createToDonation(transferInfo) {
    const mutation = createToDonationMutation(transferInfo, await isReturnTransfer(transferInfo));
    return createDonation(mutation, transferInfo.txHash);
  }

  /**
   * patch existing donations we are transferring
   *
   * @param {object} transferInfo
   */
  async function spendAndUpdateExistingDonations(transferInfo) {
    const { donations, amount } = transferInfo;
    let total = toBN(amount);

    await Promise.all(
      donations.map(async d => {
        if (total.eqn(0)) {
          logger.warn('too many donations fetched. total is already 0');
          return;
        }

        // calculate remaining total & donation amountRemaining
        let a = toBN(d.amountRemaining);
        if (a.gte(total)) {
          a = a.sub(total);
          total = toBN(0);
        } else {
          total = total.sub(a);
          a = toBN(0);
        }

        if (a.ltn(0)) {
          throw new Error(`donation.amountRemaining is < 0: ${JSON.stringify(d)}`);
        }

        const mutation = {
          amountRemaining: a.toString(),
        };

        if (isCommittedDelegation(transferInfo)) {
          mutation.status = DonationStatus.COMMITTED;
        }
        if (isRejectedDelegation(transferInfo)) {
          mutation.status = DonationStatus.REJECTED;
        }

        await donationService.patch(d._id, mutation);
      }),
    );
  }

  // fetches all necessary data to determine what happened for this Transfer event
  async function transfer(from, to, amount, ts, txHash) {
    try {
      const [fromPledge, toPledge] = await Promise.all([
        liquidPledging.getPledge(from),
        liquidPledging.getPledge(to),
      ]);

      const fromPledgeAdmin = await getPledgeAdmin(fromPledge.owner);

      if (
        (fromPledgeAdmin.type === AdminTypes.MILESTONE &&
          fromPledgeAdmin.admin.status === MilestoneStatus.CANCELED) ||
        (fromPledgeAdmin.type === AdminTypes.CAMPAIGN &&
          fromPledgeAdmin.admin.status === CampaignStatus.CANCELED)
      ) {
        // When a project is canceled in lp, the pledges are not "reverted" until they
        // are normalized. This normalization function can be called, but it is also
        // run on before every transfer. Thus we update the donations when handling
        // the `CancelProject` event so the cache contains the appropriate info to
        // normalize & transfer the pledge in a single call
        return;
      }

      const promises = [getPledgeAdmin(toPledge.owner), getDonations(from, amount)];

      // In lp any delegate in the chain can delegate, but currently we only allow last delegate
      // to have that ability
      if (toPledge.nDelegates > 0) {
        promises.push(
          liquidPledging
            .getPledgeDelegate(to, toPledge.nDelegates)
            .then(delegate => getPledgeAdmin(delegate.idDelegate)),
        );
      } else {
        promises.push(undefined);
      }

      // fetch intendedProject pledgeAdmin
      if (Number(toPledge.intendedProject) > 0) {
        promises.push(getPledgeAdmin(toPledge.intendedProject));
      } else {
        promises.push(undefined);
      }

      const [toPledgeAdmin, donations, delegate, intendedProject] = await Promise.all(promises);

      const transferInfo = {
        fromPledgeAdmin,
        toPledgeAdmin,
        fromPledge,
        toPledge,
        toPledgeId: to,
        delegate,
        intendedProject,
        donations,
        amount,
        ts,
        txHash,
      };

      if (donations.length === 0) {
        logTransferInfo(transferInfo);
        transferInfo.donations = transferInfo.donations.map(d => {
          delete d.ownerEntity;
          return d;
        });
        delete transferInfo.fromPledgeAdmin.admin;
        delete transferInfo.toPledgeAdmin.admin;
        logger.error('missing from donation ->', JSON.stringify(transferInfo, null, 2));
        // if from donation is missing, we can't do anything
        return;
      }

      await spendAndUpdateExistingDonations(transferInfo);
      await createToDonation(transferInfo);
    } catch (err) {
      logger.error(err);
    }
  }

  return {
    /**
     * handle `Transfer` events
     *
     * @param {object} event Web3 event object
     */
    async transfer(event) {
      if (event.event !== 'Transfer') throw new Error('transfer only handles Transfer events');

      const { from, to, amount } = event.returnValues;
      const txHash = event.transactionHash;
      const ts = await getBlockTimestamp(web3, event.blockNumber);
      if (Number(from) === 0) {
        const [err] = await toWrapper(newDonation(to, amount, txHash));

        if (err) {
          logger.error('newDonation error ->', err);
        }
      } else {
        await transfer(from, to, amount, ts, txHash);
      }
    },
  };
};

module.exports = pledges;
