/* eslint-disable consistent-return */
const { toBN } = require('web3-utils');
const logger = require('winston');
const getPaymentStatus = require('./lib/getPaymentStatus');
const { getBlockTimestamp } = require('./lib/web3Helpers');
const { DonationStatus, PaymentStatus } = require('../models/donations.model');
const toWrapper = require('../utils/to');
const reprocess = require('../utils/reprocess');

function getDonationStatus(pledgeState, pledgeAdmin, hasIntendedProject, hasDelegate) {
  if (pledgeState === '1') return DonationStatus.PAYING;
  if (pledgeState === '2') return DonationStatus.PAID;
  if (hasIntendedProject) return DonationStatus.TO_APPROVE;
  if (pledgeAdmin.type === 'giver' || hasDelegate) return DonationStatus.TO_APPROVE;
  return DonationStatus.COMMITTED;
}

/**
 * create donation mutation for the intendedProject
 *
 * If we have an intendedProject, we add it
 *
 * If there is no intendedProject and the donation has an intendedProject, this means that
 * the donation has been committed so we remove the intendedProject from the donation
 *
 *
 * @param {object} donation donation instance
 * @param {object|undefined} intendedProject pledgeAdmin instance for the intendedProject on the pledge
 * @returns {object} mutation
 */
function createIntendedProjectMutation(donation, intendedProject) {
  const mutation = {};

  if (intendedProject) {
    Object.assign(mutation, {
      intendedProject: intendedProject.id,
      intendedProjectId: intendedProject.typeId,
      intendedProjectType: intendedProject.type,
    });
  }

  // if we don't have an intendedProject & donation does, we need to remove from existing donation
  if (!intendedProject && donation.intendedProject) {
    Object.assign(mutation, {
      $unset: {
        intendedProject: true,
        intendedProjectId: true,
        intendedProjectType: true,
      },
    });
  }

  return mutation;
}

/**
 * create a mutation for the delegate
 *
 * If we have a delegate, we add it
 *
 * If there is no intendedProject and the donation has an intendedProject, this means that
 * the donation has been committed so we remove the intendedProject from the donation
 *
 * @param {object} donation donation instance
 * @param {object|undefined} delegate pledgeAdmin instance for the delegate on the pledge
 * @param {object} toPledge liquidPledging `Pledge` instance
 * @returns {object} mutation
 */
function createDelegateMutation(donation, delegate, toPledge) {
  const mutation = {};

  if (delegate) {
    Object.assign(mutation, {
      delegate: delegate.id,
      delegateId: delegate.typeId,
      // TODO need to add delegateType?
    });
  }

  // if we don't have a delegate & donation does or the pledge no longer has a `Pledged` paymentStatus,
  // we need to remove from existing donation
  const isPledged = getPaymentStatus(toPledge.pledgeState) === PaymentStatus.PLEDGED;
  if ((!delegate || !isPledged) && donation.delegate) {
    Object.assign(mutation, {
      $unset: {
        delegate: true,
        delegateId: true,
        delegateType: true,
      },
    });
  }

  return mutation;
}

/**
 * @param {number|string} commitTime liquidPledging `commitTime`
 * @param {number} ts default commitTime
 */
function getCommitTime(commitTime, ts) {
  // * 1000 is to convert evm ts to js ts
  return Number(commitTime) > 0 ? new Date(commitTime * 1000) : ts;
}

/**
 * generate a mutation object used to update the current donation based off of the
 * given transferInfo
 *
 * @param {object} transferInfo object containing information regarding the Transfer event
 */
async function createDonationMutation(milestoneService, transferInfo) {
  const {
    toPledgeAdmin,
    toPledge,
    toPledgeId,
    delegate,
    intendedProject,
    donation,
    amount,
    ts,
  } = transferInfo;

  const status = getDonationStatus(toPledge, toPledgeAdmin, !!intendedProject, !!delegate);

  const mutation = Object.assign(
    {},
    createIntendedProjectMutation(donation, intendedProject),
    createDelegateMutation(donation, delegate, toPledge),
    {
      amount, // TODO don't modify amount, add a spent or remainingAmount param
      paymentStatus: getPaymentStatus(toPledge.pledgeState),
      owner: toPledge.owner,
      ownerId: toPledgeAdmin.typeId,
      ownerType: toPledgeAdmin.type,
      pledgeId: toPledgeId,
      commitTime: getCommitTime(toPledge.commitTime, ts),
      status,
    },
  );

  // if the toPledge is paying or paid and the owner is a milestone, then
  // we need to update the milestones status
  if (['1', '2'].includes(toPledge.pledgeState) && toPledgeAdmin.type === 'milestone') {
    // TODO can we move this somewhere else?
    milestoneService.patch(toPledgeAdmin.typeId, {
      status: toPledge.pledgeState === '1' ? 'Paying' : 'Paid',
      mined: true,
    });
  }

  return mutation;
}

/**
 * @param {object} transferInfo
 */
const isNewDonation = ({ toDonation, fromPledge, toPledge, toPledgeAdmin }) =>
  !toDonation &&
  Number(fromPledge.oldPledge) > 0 &&
  (toPledgeAdmin.type !== 'giver' || Number(toPledge.nDelegates) === 1) &&
  Number(toPledge.intendedProject) > 0;

/**
 * @param {object} transferInfo
 */
const isCommittedDelegation = ({ toDonation, fromPledge, toPledge }) =>
  !toDonation &&
  Number(fromPledge.intendedProject) > '0' &&
  fromPledge.intendedProject === toPledge.owner;

/**
 * @param {object} transferInfo
 */
const isCampaignToMilestone = ({ toDonation, fromPledgeAdmin, toPledgeAdmin }) =>
  !toDonation && fromPledgeAdmin.type === 'campaign' && toPledgeAdmin.type === 'milestone';

/**
 *
 * @param {object} app feathers app instance
 * @param {object} liquidPledging liquidPledging contract instance
 * @param {object} queue processingQueue
 */
const pledges = (app, liquidPledging, queue) => {
  const web3 = app.getWeb3();
  const donationService = app.service('donations');
  const pledgeAdmins = app.service('pledgeAdmins');

  async function getDonation(pledgeId, amount, txHash) {
    const donations = await donationService.find({
      paginate: false,
      schema: 'includeTypeAndGiverDetails',
      query: { pledgeId },
    });
    if (donations.length === 1) return donations[0];

    // check for any donations w/ matching txHash
    // this won't work when confirmPayment is called on the vault
    const filteredDonationsByTxHash = donations.filter(donation => donation.txHash === txHash);

    if (filteredDonationsByTxHash.length === 1) return filteredDonationsByTxHash[0];

    const filteredDonationsByAmount = donations.filter(donation => donation.amount === amount);

    // possible to have 2 donations w/ same pledgeId & amount. This would happen if a giver makes
    // a donation to the same delegate/project for the same amount multiple times. Currently there
    // no way to tell which donation was acted on if the txHash didn't match, so we just return the first
    if (filteredDonationsByAmount.length > 0) return filteredDonationsByAmount[0];

    // TODO is this comment only applicable while we don't support splits?
    // this is probably a split which happened outside of the ui
    throw new Error(
      `unable to determine what donations entity to update -> pledgeId: ${pledgeId}, amount: ${amount}, txHash: ${txHash}, donations: ${JSON.stringify(
        donations,
        null,
        2,
      )}`,
    );
  }

  async function newDonation(pledgeId, amount, txHash, retry = false) {
    // const findDonation = () =>
    // donations
    // .find({ query: { txHash } })
    // .then(resp => (resp.data.length > 0 ? resp.data[0] : undefined));

    const pledge = await liquidPledging.getPledge(pledgeId);

    const [giver, donation] = await Promise.all([
      pledgeAdmins.get(pledge.owner),
      // TODO we only want the first donation, will this return an array or object? will it return undefined?
      donationService.find({ paginate: false, $limit: 1, query: { txHash } }),
    ]);
    console.log(donation);

    const mutation = {
      giverAddress: giver.admin.address, // giver is a user type
      amount,
      pledgeId,
      owner: pledge.owner,
      ownerId: giver.typeId,
      ownerType: giver.type,
      status: DonationStatus.WAITING, // waiting for delegation by owner
      paymentStatus: getPaymentStatus(pledge.pledgeState),
    };

    if (!donation) {
      // if this is the second attempt, then create a donation object
      // otherwise, try and process the event later, giving time for
      // the donation entity to be created via REST api first
      // this is really only useful when instant mining. and re-syncing feathers w/ past events.
      // Other then that, the donation should always be created before the tx was mined.
      return retry
        ? donationService.create(Object.assign(mutation, { txHash }))
        : reprocess(newDonation.bind(pledgeId, amount, txHash, true), 5000);
    }

    return donationService.patch(donation._id, mutation);
  }

  /**
   * spend some amount of an existing donation
   */
  async function spendExistingDonation(donation, amount, fromPledge, fromPledgeAdmin) {
    const a = toBN(donation.amount)
      .sub(toBN(amount))
      .toString();

    let status = DonationStatus.PAID;
    if (Number(amount) > 0) {
      status = getDonationStatus(
        fromPledge,
        fromPledgeAdmin,
        donation.intendedProject && Number(donation.intendedProject) !== 0,
        !!donation.delegate,
      );
    }

    return donationService.patch(donation._id, {
      status,
      // TODO this should not update amount, but an remainingAmount value
      amount: a,
    });
  }

  async function trackDonationHistory(transferInfo) {
    // TODO clean this up. Maybe we don't need this if we are tracking all transactions?
    const donationsHistory = app.service('donations/history');
    const {
      fromPledgeAdmin,
      toPledgeAdmin,
      toPledge,
      delegate,
      donation,
      toDonation,
      amount,
    } = transferInfo;

    const history = {
      ownerId: toPledgeAdmin.typeId,
      ownerType: toPledgeAdmin.type,
      amount,
      txHash: donation.txHash,
      donationId: donation._id,
      giverAddress: donation.giverAddress,
    };

    if (delegate) {
      Object.assign(history, {
        delegateType: delegate.type,
        delegateId: delegate.typeId,
      });
    }

    // new donations & committed delegations
    if (
      Number(toPledge.pledgeState) === 0 &&
      (isNewDonation(transferInfo) ||
        isCommittedDelegation(transferInfo) ||
        isCampaignToMilestone(transferInfo))
    ) {
      // TODO remove this if statement one we handle all scenarios
      return donationsHistory.create(history);
    }

    // regular transfer
    if (toPledge.pledgeState === '0' && toDonation) {
      Object.assign(history, {
        donationId: toDonation._id,
        fromDonationId: donation._id,
        fromOwnerId: fromPledgeAdmin.typeId,
        fromOwnerType: fromPledgeAdmin.type,
      });
      return donationsHistory.create(history);
    }

    // if (toPledge.paymentStatus === 'Paying' || toPledge.paymentStatus === 'Paid') {
    //   // payment has been initiated/completed in vault
    //   return donationsHistory.create({
    //     status: (toPledge.paymentStatus === 'Paying') ? 'Payment Initiated' : 'Payment Completed',
    //     createdAt: ts,
    //   }, { donationId: donation._id });
    // }

    // canceled payment from vault

    // vetoed delegation
  }

  async function doTransfer(transferInfo) {
    const { fromPledge, fromPledgeAdmin, donation, amount } = transferInfo;

    if (donation.amount === amount) {
      // this is a complete pledge transfer
      const mutation = createDonationMutation(app.service('milestone'), transferInfo);

      await donationService.patch(donation._id, mutation);
      trackDonationHistory(transferInfo);
    }

    // this is a split

    // TODO create a donation model that copies the appropriate data
    // create a new donation
    const splitDonation = Object.assign({}, donation, createDonationMutation(transferInfo));

    delete splitDonation._id;
    delete splitDonation.giver;
    delete splitDonation.ownerEntity;
    delete splitDonation.requiredConfirmations;
    delete splitDonation.confirmations;

    const [, created] = await Promise.all([
      spendExistingDonation(donation, amount, fromPledge, fromPledgeAdmin),
      donationService.create(splitDonation),
    ]);

    trackDonationHistory(Object.assign({}, transferInfo, { toDonation: created }));
  }

  async function transfer(from, to, amount, ts, txHash) {
    // fetches all necessary data to determine what happened for this Transfer event
    // TODO can we fetch the data as needed instead of all up front?
    try {
      const [fromPledge, toPledge] = await Promise.all([
        liquidPledging.getPledge(from),
        liquidPledging.getPledge(to),
      ]);

      const promises = [
        pledgeAdmins.get(fromPledge.owner),
        pledgeAdmins.get(toPledge.owner),
        getDonation(from, amount, txHash),
      ];

      // In lp any delegate in the chain can delegate, but currently we only allow last delegate
      // to have that ability
      if (toPledge.nDelegates > 0) {
        promises.push(
          liquidPledging
            .getPledgeDelegate(to, toPledge.nDelegates)
            .then(delegate => pledgeAdmins.get(delegate.idDelegate)),
        );
      } else {
        promises.push(undefined);
      }

      // fetch intendedProject pledgeAdmin
      if (Number(toPledge.intendedProject) > 0) {
        promises.push(pledgeAdmins.get(toPledge.intendedProject));
      } else {
        promises.push(undefined);
      }

      const [fromPledgeAdmin, toPledgeAdmin, donation, delegate, intendedProject] = await promises;

      const transferInfo = {
        fromPledgeAdmin,
        toPledgeAdmin,
        fromPledge,
        toPledge,
        toPledgeId: to,
        delegate,
        intendedProject,
        donation,
        amount,
        ts,
      };

      if (!donation) logger.error('missing donation for ->', JSON.stringify(transferInfo, null, 2));

      return doTransfer(transferInfo);
    } catch (err) {
      logger.error(err);
    }
  }

  async function processEvent(event, retry = false) {
    const { from, to, amount } = event.returnValues;
    const txHash = event.transactionHash;
    const ts = await getBlockTimestamp(web3, event.blockNumber);
    if (from === '0') {
      const [err] = await toWrapper(newDonation(to, amount, txHash, retry));

      if (err) {
        logger.error('newDonation error ->', err);
      }
    } else {
      await transfer(from, to, amount, ts, txHash);
    }
    await queue.purge(txHash);
  }

  return {
    /**
     * handle `Transfer` events
     *
     * @param {object} event Web3 event object
     */
    transfer(event) {
      if (event.event !== 'Transfer') throw new Error('transfer only handles Transfer events');

      // there will be multiple events in a single transaction
      // we need to process them in order so we use a queue
      queue.add(event.transactionHash, processEvent);

      if (!queue.isProcessing(event.transactionHash)) {
        // start processing this event. We add to the queue first, so
        // the queue can track the event processing for the txHash
        queue.purge(event.transactionHash);
      }
    },
  };
};

module.exports = pledges;
