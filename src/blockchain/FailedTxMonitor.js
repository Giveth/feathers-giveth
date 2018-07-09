const Contract = require('web3-eth-contract');
const LiquidPledgingArtifact = require('giveth-liquidpledging/build/LiquidPledging.json');
const logger = require('winston');
const LPVaultArtifact = require('giveth-liquidpledging/build/LPVault.json');
const LPPCappedMilestoneArtifact = require('lpp-capped-milestone/build/LPPCappedMilestone.json');

const { status: DACStatus } = require('../models/dacs.model');
const { status: CampaignStatus } = require('../models/campaigns.model');

const FIFTEEN_MINUTES = 1000 * 60 * 15;
const TWO_HOURS = 1000 * 60 * 60 * 2;

/**
 * @param {object} artifact solcpiler generated artifact for a solidity contract
 * @returns {object} map of event names => log decoder
 */
function eventDecodersFromArtifact(artifact) {
  return artifact.compilerOutput.abi.filter(method => method.type === 'event').reduce(
    (decoders, event) =>
      Object.assign({}, decoders, {
        [event.name]: Contract.prototype._decodeEventABI.bind(event),
      }),
    {},
  );
}

/**
 * get the log decoders for the events we are interested in
 */
function eventDecoders() {
  return {
    lp: eventDecodersFromArtifact(LiquidPledgingArtifact),
    vault: eventDecodersFromArtifact(LPVaultArtifact),
    milestone: eventDecodersFromArtifact(LPPCappedMilestoneArtifact),
  };
}

function getPending(app, service, query) {
  return app.service(service).find({ paginate: false, query });
}

function getPendingDonations(app) {
  const query = { $or: [{ status: 'pending' }, { status: 'Pending' }] };
  return getPending(app, 'donations', query);
}

function getPendingDacs(app) {
  const query = { status: DACStatus.PENDING };
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
    $or: [{ status: 'pending' }, { status: 'Pending' }, { mined: false }],
  };
  return getPending(app, 'milestones', query);
}

// TODO dynamically generate the topics from the artifacts

/**
 * factory function for generating a failedTxMonitor.
 */
const failedTxMonitor = (app, eventHandler) => {
  const web3 = app.getWeb3();
  const decoders = eventDecoders();
  const { requiredConfirmations } = app.get('blockchain');

  async function revertDonationIfFailed(currentBlock, donation) {
    if (!donation.previousState || !donation.txHash) return;

    const receipt = await web3.eth.getTransactionReceipt(donation.txHash);

    // reset the donation status if the tx has been pending for more then 2 hrs, otherwise ignore
    if (!receipt && donation.updatedAt <= Date.now() - TWO_HOURS) return;
    // ignore if there isn't enough confirmations
    if (receipt && currentBlock - receipt.blockNumber < requiredConfirmations) return;

    if (!receipt || !receipt.status) {
      app
        .service('donations')
        .patch(
          donation._id,
          Object.assign({}, donation.previousState, { $unset: { previousState: true } }),
        )
        .catch(logger.error);
      return;
    }

    const topics = [
      {
        name: 'Transfer',
        hash: web3.utils.keccak256('Transfer(uint256,uint256,uint256)'),
      },
      {
        name: 'AuthorizePayment',
        hash: web3.utils.keccak256('AuthorizePayment(uint256,bytes32,address,address,uint256)'),
      },
    ];

    // get logs we're interested in.
    const logs = receipt.logs.filter(log => topics.some(t => t.hash === log.topics[0]));

    if (logs.length === 0) {
      logger.error(
        'donation has status === `pending` but transaction was successful donation:',
        donation,
        'receipt:',
        receipt,
      );
    }

    logs.forEach(log => {
      logger.info(
        'donation has status === `pending` but transaction was successful. re-emitting event donation:',
        donation,
        'receipt:',
        receipt,
      );

      const topic = topics.find(t => t.hash === log.topics[0]);

      if (topic.name === 'AuthorizePayment') {
        eventHandler.handle(decoders.vault[topic.name](log));
      } else {
        eventHandler.handle(decoders.lp[topic.name](log));
      }
    });
  }

  async function updateDACIfFailed(currentBlock, dac) {
    if (!dac.txHash) return;

    const receipt = await web3.eth.getTransactionReceipt(dac.txHash);
    // reset the dac status if the tx has been pending for more then 2 hrs, otherwise ignore
    if (!receipt && dac.updatedAt <= Date.now() - TWO_HOURS) return;
    // ignore if there isn't enough confirmations
    if (receipt && currentBlock - receipt.blockNumber < requiredConfirmations) return;

    if (!receipt || !receipt.status) {
      app
        .service('dacs')
        .patch(dac._id, {
          status: DACStatus.FAILED,
        })
        .catch(logger.error);

      return;
    }

    const topics = [
      {
        name: 'DelegateAdded',
        hash: web3.utils.keccak256('DelegateAdded(uint64,string)'),
      },
    ];

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
        dac,
        'receipt:',
        receipt,
      );

      const topic = topics.find(t => t.hash === log.topics[0]);
      eventHandler.handle(decoders.lp[topic.name](log));
    });
  }

  async function updateCampaignIfFailed(currentBlock, campaign) {
    if (!campaign.txHash) return;

    const receipt = await web3.eth.getTransactionReceipt(campaign.txHash);
    // reset the campaign status if the tx has been pending for more then 2 hrs, otherwise ignore
    if (!receipt && campaign.updatedAt <= Date.now() - TWO_HOURS) return;
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

    const topics = [
      { name: 'ProjectAdded', hash: web3.utils.keccak256('ProjectAdded(uint64,string)') },
      { name: 'CancelProject', hash: web3.utils.keccak256('CancelProject(uint256)') },
    ];

    // get logs we're interested in.
    const logs = receipt.logs.filter(log => topics.some(t => t.hash === log.topics[0]));

    if (logs.length === 0) {
      logger.error(
        'campaign status === `pending` or mined === false but transaction was successful campaign:',
        campaign,
        'receipt:',
        receipt,
      );
    }

    logs.forEach(log => {
      logger.info(
        'campaign status === `pending` or mined === false but transaction was successful. re-emitting event. campaign:',
        campaign,
        'receipt:',
        receipt,
      );

      const topic = topics.find(t => t.hash === log.topics[0]);
      eventHandler.handle(decoders.lp[topic.name](log));
    });
  }

  async function updateMilestoneIfFailed(currentBlock, milestone) {
    if (!milestone.txHash) return; // we can't revert

    const receipt = await web3.eth.getTransactionReceipt(milestone.txHash);
    // reset the milestone status if the tx has been pending for more then 2 hrs, otherwise ignore
    if (!receipt && milestone.updatedAt <= Date.now() - TWO_HOURS) return;
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

    const topics = [
      { name: 'ProjectAdded', hash: web3.utils.keccak256('ProjectAdded(uint64,string)') },
      { name: 'CancelProject', hash: web3.utils.keccak256('CancelProject(uint256)') },
      {
        name: 'MilestoneCompleteRequested',
        hash: web3.utils.keccak256('MilestoneCompleteRequested(address,uint64)'),
      },
      {
        name: 'MilestoneCompleteRequestRejected',
        hash: web3.utils.keccak256('MilestoneCompleteRequested(address,uint64)'),
      },
      {
        name: 'MilestoneCompleteRequestApproved',
        hash: web3.utils.keccak256('MilestoneCompleteRequestApproved(address,uint64)'),
      },
      {
        name: 'MilestoneChangeReviewerRequested',
        hash: web3.utils.keccak256('MilestoneChangeReviewerRequested(address,uint64,address)'),
      },
      {
        name: 'MilestoneReviewerChanged',
        hash: web3.utils.keccak256('MilestoneReviewerChanged(address,uint64,address)'),
      },
      {
        name: 'MilestoneChangeCampaignReviewerRequested',
        hash: web3.utils.keccak256(
          'MilestoneChangeCampaignReviewerRequested(address,uint64,address)',
        ),
      },
      {
        name: 'MilestoneCampaignReviewerChanged',
        hash: web3.utils.keccak256('MilestoneCampaignReviewerChanged(address,uint64,address)'),
      },
      {
        name: 'MilestoneChangeRecipientRequested',
        hash: web3.utils.keccak256('MilestoneChangeRecipientRequested(address,uint64,address)'),
      },
      {
        name: 'MilestoneRecipientChanged',
        hash: web3.utils.keccak256('MilestoneRecipientChanged(address,uint64,address)'),
      },
      {
        name: 'PaymentCollected',
        hash: web3.utils.keccak256('PaymentCollected(address,uint64)'),
      },
    ];

    // get logs we're interested in.
    const logs = receipt.logs.filter(log => topics.some(t => t.hash === log.topics[0]));

    if (logs.length === 0) {
      logger.error(
        'milestone status === `pending` or mined === false but transaction was successful milestone:',
        milestone,
        'receipt:',
        receipt,
      );
    }

    logs.forEach(log => {
      logger.info(
        'milestone status === `pending` or mined === false but transaction was successful. re-emitting event. milestone:',
        milestone,
        'receipt:',
        receipt,
      );

      const topic = topics.find(t => t.hash === log.topics[0]);

      if (topic.name === 'MilestoneAccepted') {
        eventHandler.handle(decoders.milestone[topic.name](log));
      } else {
        eventHandler.handle(decoders.lp[topic.name](log));
      }
    });
  }

  async function checkPendingDonations() {
    try {
      const [blockNumber, pendingDonations] = await Promise.all([
        web3.eth.getBlockNumber(),
        getPendingDonations(app),
      ]);

      pendingDonations.forEach(d => revertDonationIfFailed(blockNumber, d));
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
