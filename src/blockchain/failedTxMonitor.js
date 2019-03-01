const LiquidPledgingArtifact = require('giveth-liquidpledging/build/LiquidPledging.json');
const { toBN } = require('web3-utils');
const logger = require('winston');
const LPVaultArtifact = require('giveth-liquidpledging/build/LPVault.json');
const LPPCappedMilestoneArtifact = require('lpp-capped-milestone/build/LPPCappedMilestone.json');
const LPMilestoneArtifact = require('lpp-milestones/build/LPMilestone.json');
const BridgedMilestoneArtifact = require('lpp-milestones/build/BridgedMilestone.json');

const eventDecodersFromArtifact = require('./lib/eventDecodersFromArtifact');
const topicsFromArtifacts = require('./lib/topicsFromArtifacts');
const { DacStatus } = require('../models/dacs.model');
const { DonationStatus } = require('../models/donations.model');
const { CampaignStatus } = require('../models/campaigns.model');
const { MilestoneStatus } = require('../models/milestones.model');

const FIFTEEN_MINUTES = 1000 * 60 * 15;
const TWO_HOURS = 1000 * 60 * 60 * 2;

/**
 * get the log decoders for the events we are interested in
 */
function eventDecoders() {
  return {
    lp: eventDecodersFromArtifact(LiquidPledgingArtifact),
    vault: eventDecodersFromArtifact(LPVaultArtifact),
    milestone: {
      ...eventDecodersFromArtifact(LPPCappedMilestoneArtifact),
      ...eventDecodersFromArtifact(LPMilestoneArtifact),
      ...eventDecodersFromArtifact(BridgedMilestoneArtifact),
    },
  };
}

function getPending(app, service, query) {
  return app.service(service).find({ paginate: false, query });
}

function getPendingDonations(app) {
  const query = {
    $or: [{ status: DonationStatus.PENDING }, { mined: false }],
  };
  return getPending(app, 'donations', query);
}

function getPendingDacs(app) {
  const query = { status: DacStatus.PENDING };
  return getPending(app, 'dacs', query);
}

function getPendingCampaigns(app) {
  const query = {
    $or: [{ status: CampaignStatus.PENDING }, { mined: false }],
  };
  return getPending(app, 'campaigns', query);
}

function getPendingMilestones(app) {
  const query = {
    $or: [{ status: MilestoneStatus.PENDING }, { mined: false }],
  };
  return getPending(app, 'milestones', query);
}

function createFailedDonationSingleParentMutation(parentDonation, donation) {
  const amount = toBN(donation.amount);
  const mutation = {};
  let { pendingAmountRemaining } = parentDonation;
  if (!pendingAmountRemaining) return {};

  pendingAmountRemaining = toBN(pendingAmountRemaining);
  const amountPending = toBN(parentDonation.amountRemaining).sub(pendingAmountRemaining);

  if (amountPending.eq(amount)) {
    mutation.$unset = { pendingAmountRemaining: true };
  } else if (amountPending.lt(amount)) {
    logger.error(
      'Failed donation w/ single parentDonation has amount > (parentDonation.amountRemaining - parentDonation.pendingAmountRemaining)',
      donation,
      pendingAmountRemaining.toString(),
    );
    mutation.$unset = { pendingAmountRemaining: true };
  } else {
    mutation.pendingAmountRemaining = pendingAmountRemaining.add(amount).toString();
  }

  return mutation;
}

/**
 * factory function for generating a failedTxMonitor.
 */
const failedTxMonitor = (app, eventWatcher) => {
  const web3 = app.getWeb3();
  const homeWeb3 = app.getHomeWeb3();
  const decoders = eventDecoders();
  const { requiredConfirmations } = app.get('blockchain');

  async function updateFailedDonationParents(donation) {
    const donationService = app.service('donations');
    const parentIds = donation.parentDonations;

    const parentDonations = await donationService.find({
      paginate: false,
      query: { _id: { $in: parentIds } },
    });

    let remaining = toBN(donation.amount);

    if (parentIds.length === 1) {
      const mutation = createFailedDonationSingleParentMutation(parentDonations[0], donation);
      donationService.patch(parentDonations[0]._id, mutation);
      return;
    }

    // if sum of all parentDonations.amountRemaining w/ pendingAmountRemaining == donation.amount
    // we can just unset add pendingAmountRemaining on the parents
    const totalAmountRemaining = parentDonations
      .filter(d => !!d.pendingAmountRemaining)
      .reduce((amounts, d) => amounts.add(toBN(d.amountRemaining)), toBN(0));

    if (totalAmountRemaining.eq(remaining)) {
      donationService.patch(
        null,
        { $unset: { pendingAmountRemaining: true } },
        { query: { _id: { $in: parentIds } } },
      );
      return;
    }

    // TODO: there may be edge cases where this doesn't update correctly and should be further analyzed.
    // sort any donations w/ pendingAmountRemaining > 0 first
    parentDonations.sort((a, b) => {
      const aPending = toBN(a.pendingAmountRemaining);
      const bPending = toBN(b.pendingAmountRemaining);

      if (aPending.eqn(0) && bPending.eqn(0)) return 0;
      if (aPending.eqn(0)) return 1;
      return -1;
    });

    parentDonations.forEach(async d => {
      if (remaining.eqn(0)) {
        logger.warn('too many parent Donations fetched. total is already 0', donation, parentIds);
        return;
      }

      // calculate remaining total & donation amountRemaining
      let pendingAmountRemaining = toBN(d.pendingAmountRemaining);
      let amountPending = toBN(d.amountRemaining).sub(pendingAmountRemaining);
      if (remaining.gte(amountPending)) {
        remaining = remaining.sub(amountPending);
        amountPending = toBN(0);
      } else {
        pendingAmountRemaining = pendingAmountRemaining.add(remaining);
        remaining = toBN(0);

        if (pendingAmountRemaining.gt(toBN(d.amount))) {
          throw new Error(
            `donation.pendingAmountRemaining is < donation.amount: ${JSON.stringify(d)}`,
          );
        }
      }

      const mutation = amountPending.eqn(0)
        ? { $unset: { pendingAmountRemaining: true } }
        : { pendingAmountRemaining };

      await donationService.patch(d._id, mutation);
    });
  }

  async function handlePendingDonation(currentBlock, donation, receipt, topics) {
    // reset the donation status if the tx has been pending for more then 2 hrs, otherwise ignore
    if (!receipt && donation.updatedAt.getTime() >= Date.now() - TWO_HOURS) return;
    // ignore if there isn't enough confirmations
    if (receipt && currentBlock - receipt.blockNumber < requiredConfirmations) return;

    if (!receipt || !receipt.status) {
      if (donation.parentDonations.length > 0) {
        updateFailedDonationParents(donation);
      }
      app
        .service('donations')
        .patch(donation._id, {
          status: DonationStatus.FAILED,
          mined: true,
        })
        .catch(logger.error);
      return;
    }

    // get logs we're interested in.
    const logs = receipt.logs.filter(log => topics.some(t => t.hash === log.topics[0]));

    if (logs.length === 0) {
      logger.error(
        'donation has status === `Pending` but transaction was successful -> donation:',
        donation,
        'receipt:',
        receipt,
      );
    }

    logs.forEach(log => {
      logger.info(
        'donation has status === `Pending` but transaction was successful. re-emitting event donation:',
        donation,
        'receipt:',
        receipt,
      );

      const topic = topics.find(t => t.hash === log.topics[0]);

      eventWatcher.addEvent(decoders.lp[topic.name](log));
    });
  }

  async function updateInitialDonationIfFailed(currentBlock, donation) {
    if (!donation.homeTxHash) return;

    const receipt = await homeWeb3.eth.getTransactionReceipt(donation.homeTxHash);
    const topics = topicsFromArtifacts([LiquidPledgingArtifact], ['Transfer']);

    // TODO low priority as it isn't likely, but would be good to check foreignBridge for a Deposit
    // event w/ homeTx === donation.homeTxHash and reprocess the event if necessary. This would require
    // re-deploying the ForeignGivethBridge w/ homeTx as an indexed event param
    if (!receipt || !receipt.status) {
      handlePendingDonation(currentBlock, donation, receipt, topics);
    } else {
      logger.error(
        'donation has status === `Pending` but home transaction was successful. Was the donation correctly bridged?',
      );
    }
  }

  async function updateDonationIfFailed(currentBlock, donation) {
    if (!donation.txHash) return;

    const receipt = await web3.eth.getTransactionReceipt(donation.txHash);
    if (receipt && currentBlock - receipt.blockNumber < requiredConfirmations) return;

    const topics = topicsFromArtifacts([LiquidPledgingArtifact], ['Transfer']);

    handlePendingDonation(currentBlock, donation, receipt, topics);
  }

  async function updateDACIfFailed(currentBlock, dac) {
    if (!dac.txHash) return;

    const receipt = await web3.eth.getTransactionReceipt(dac.txHash);
    // reset the dac status if the tx has been pending for more then 2 hrs, otherwise ignore
    if (!receipt && dac.updatedAt.getTime() >= Date.now() - TWO_HOURS) return;
    // ignore if there isn't enough confirmations
    if (receipt && currentBlock - receipt.blockNumber < requiredConfirmations) return;

    if (!receipt || !receipt.status) {
      app
        .service('dacs')
        .patch(dac._id, {
          status: DacStatus.FAILED,
        })
        .catch(logger.error);

      return;
    }

    const topics = topicsFromArtifacts([LiquidPledgingArtifact], ['DelegateAdded']);

    // get logs we're interested in.
    const logs = receipt.logs.filter(log => topics.some(t => t.hash === log.topics[0]));

    if (logs.length === 0) {
      logger.error(
        'dac has no delegateId but transaction was successful dac:',
        dac,
        'receipt:',
        receipt,
      );
    }

    logs.forEach(log => {
      logger.info(
        'dac has no delegateId but transaction was successful. re-emitting AddDelegate event. dac:',
        { ...dac, image: null },
        'receipt:',
        receipt,
      );

      const topic = topics.find(t => t.hash === log.topics[0]);
      eventWatcher.addEvent(decoders.lp[topic.name](log));
    });
  }

  async function updateCampaignIfFailed(currentBlock, campaign) {
    if (!campaign.txHash) return;

    const receipt = await web3.eth.getTransactionReceipt(campaign.txHash);
    // reset the campaign status if the tx has been pending for more then 2 hrs, otherwise ignore
    if (!receipt && campaign.updatedAt.getTime() >= Date.now() - TWO_HOURS) return;
    // ignore if there isn't enough confirmations
    if (receipt && currentBlock - receipt.blockNumber < requiredConfirmations) return;

    if (!receipt || !receipt.status) {
      // if status !== pending, then the cancel campaign transaction failed, so reset
      const mutation =
        campaign.status === CampaignStatus.PENDING
          ? { status: CampaignStatus.FAILED }
          : { status: CampaignStatus.ACTIVE, mined: true };

      app
        .service('campaigns')
        .patch(campaign._id, mutation)
        .catch(logger.error);
      return;
    }

    const topics = topicsFromArtifacts([LiquidPledgingArtifact], ['ProjectAdded', 'CancelProject']);

    // get logs we're interested in.
    const logs = receipt.logs.filter(log => topics.some(t => t.hash === log.topics[0]));

    if (logs.length === 0) {
      logger.error(
        'campaign status === `Pending` or mined === false but transaction was successful campaign:',
        { ...campaign, image: null },
        'receipt:',
        receipt,
      );
    }

    logs.forEach(log => {
      logger.info(
        'campaign status === `Pending` or mined === false but transaction was successful. re-emitting event. campaign:',
        { ...campaign, image: null },
        'receipt:',
        receipt,
      );

      const topic = topics.find(t => t.hash === log.topics[0]);
      eventWatcher.addEvent(decoders.lp[topic.name](log));
    });
  }

  async function updateMilestoneIfFailed(currentBlock, milestone) {
    if (!milestone.txHash) return; // we can't revert

    const receipt = await web3.eth.getTransactionReceipt(milestone.txHash);
    // reset the milestone status if the tx has been pending for more then 2 hrs, otherwise ignore
    if (!receipt && milestone.updatedAt.getTime() >= Date.now() - TWO_HOURS) return;
    // ignore if there isn't enough confirmations
    if (receipt && currentBlock - receipt.blockNumber < requiredConfirmations) return;

    if (!receipt || !receipt.status) {
      // Here we simply revert back to the previous state of the milestone
      app
        .service('milestones')
        .patch(milestone._id, {
          status: milestone.prevStatus,
          mined: true,
        })
        .catch(logger.error);
      return;
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

    if (logs.length === 0) {
      logger.error(
        'milestone status === `Pending` or mined === false but transaction was successful milestone:',
        milestone,
        'receipt:',
        receipt,
      );
    }

    logs.forEach(log => {
      logger.info(
        'milestone status === `Pending` or mined === false but transaction was successful. re-emitting event. milestone:',
        { ...milestone, image: null },
        'receipt:',
        receipt,
      );

      const topic = topics.find(t => t.hash === log.topics[0]);

      if (['ProjectAdded', 'CancelProject'].includes(topic.name)) {
        eventWatcher.addEvent(decoders.lp[topic.name](log));
      } else {
        eventWatcher.addEvent(decoders.milestone[topic.name](log));
      }
    });
  }

  async function checkPendingDonations() {
    try {
      const [blockNumber, pendingDonations] = await Promise.all([
        web3.eth.getBlockNumber(),
        getPendingDonations(app),
      ]);

      pendingDonations.forEach(
        d =>
          d.txHash
            ? updateDonationIfFailed(blockNumber, d)
            : updateInitialDonationIfFailed(blockNumber, d),
      );
    } catch (e) {
      logger.error(e);
    }
  }

  async function checkPendingDACS() {
    try {
      const [blockNumber, pendingDacs] = await Promise.all([
        web3.eth.getBlockNumber(),
        getPendingDacs(app),
      ]);

      pendingDacs.forEach(d => updateDACIfFailed(blockNumber, d));
    } catch (e) {
      logger.error(e);
    }
  }

  async function checkPendingCampaigns() {
    try {
      const [blockNumber, pendingCampaigns] = await Promise.all([
        web3.eth.getBlockNumber(),
        getPendingCampaigns(app),
      ]);

      pendingCampaigns.forEach(c => updateCampaignIfFailed(blockNumber, c));
    } catch (e) {
      logger.error(e);
    }
  }

  async function checkPendingMilestones() {
    try {
      const [blockNumber, pendingMilestones] = await Promise.all([
        web3.eth.getBlockNumber(),
        getPendingMilestones(app),
      ]);

      pendingMilestones.forEach(m => updateMilestoneIfFailed(blockNumber, m));
    } catch (e) {
      logger.error(e);
    }
  }

  const intervals = [];
  return {
    /**
     * start monitor to check for failed transactions. If any failed txs are found,
     * the ui state is reverted
     */
    start() {
      intervals.push(setInterval(checkPendingDonations, FIFTEEN_MINUTES));
      intervals.push(setInterval(checkPendingDACS, FIFTEEN_MINUTES));
      intervals.push(setInterval(checkPendingCampaigns, FIFTEEN_MINUTES));
      intervals.push(setInterval(checkPendingMilestones, FIFTEEN_MINUTES));
      checkPendingDonations();
      checkPendingDACS();
      checkPendingCampaigns();
      checkPendingMilestones();
    },

    close() {
      intervals.forEach(clearInterval);
      // clear intervals array
      intervals.splice(0, intervals.length);
    },
  };
};

module.exports = failedTxMonitor;
