const Contract = require('web3-eth-contract');
const EventEmitter = require('events');
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

/**
 * class to check if any transactions failed and to revert the ui state if so
 */
class FailedTxMonitor extends EventEmitter {
  constructor(web3, app) {
    super();
    this.web3 = web3;
    this.app = app;
    this.requiredConfirmations = app.get('blockchain').requiredConfirmations;

    this.LP_EVENT = 'lpEvent';
    this.MILESTONE_EVENT = 'milestoneEvent';
    this.VAULT_EVENT = 'vaultEvent';

    this.decoders = eventDecoders();
  }

  start() {
    this.donationIntervalId = setInterval(this.checkPendingDonations.bind(this), FIFTEEN_MINUTES);
    this.dacIntervalId = setInterval(this.checkPendingDACS.bind(this), FIFTEEN_MINUTES);
    this.campaignIntervalId = setInterval(this.checkPendingCampaigns.bind(this), FIFTEEN_MINUTES);
    this.milestoneIntervalId = setInterval(this.checkPendingMilestones.bind(this), FIFTEEN_MINUTES);
    this.checkPendingDonations();
    this.checkPendingDACS();
    this.checkPendingCampaigns();
    this.checkPendingMilestones();
  }

  close() {
    this.removeAllListeners();

    clearInterval(this.donationIntervalId);
    clearInterval(this.dacIntervalId);
    clearInterval(this.campaignIntervalId);
    clearInterval(this.milestoneIntervalId);
  }

  async checkPendingDonations() {
    const revertDonationIfFailed = async (currentBlock, donation) => {
      if (!donation.previousState || !donation.txHash) return;

      const receipt = await this.web3.eth.getTransactionReceipt(donation.txHash);

      // reset the donation status if the tx has been pending for more then 2 hrs, otherwise ignore
      if (!receipt && donation.updatedAt <= Date.now() - TWO_HOURS) return;
      // ignore if there isn't enough confirmations
      if (receipt && currentBlock - receipt.blockNumber < this.requiredConfirmations) return;

      if (!receipt || !receipt.status) {
        this.app
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
          hash: this.web3.utils.keccak256('Transfer(uint256,uint256,uint256)'),
        },
        {
          name: 'AuthorizePayment',
          hash: this.web3.utils.keccak256(
            'AuthorizePayment(uint256,bytes32,address,address,uint256)',
          ),
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
          this.emit(this.VAULT_EVENT, this.decoders.vault[topic.name](log));
        } else {
          this.emit(this.LP_EVENT, this.decoders.lp[topic.name](log));
        }
      });
    };

    try {
      const [blockNumber, pendingDonations] = await Promise.all([
        this.web3.eth.getBlockNumber(),
        getPendingDonations(this.app),
      ]);

      pendingDonations.forEach(d => revertDonationIfFailed(blockNumber, d));
    } catch (e) {
      logger.error(e);
    }
  }

  async checkPendingDACS() {
    const updateDACIfFailed = async (currentBlock, dac) => {
      if (!dac.txHash) return;

      const receipt = await this.web3.eth.getTransactionReceipt(dac.txHash);
      // reset the dac status if the tx has been pending for more then 2 hrs, otherwise ignore
      if (!receipt && dac.updatedAt <= Date.now() - TWO_HOURS) return;
      // ignore if there isn't enough confirmations
      if (receipt && currentBlock - receipt.blockNumber < this.requiredConfirmations) return;

      if (!receipt || !receipt.status) {
        this.app
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
          hash: this.web3.utils.keccak256('DelegateAdded(uint64,string)'),
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
        this.emit(this.LP_EVENT, this.decoders.lp[topic.name](log));
      });
    };

    try {
      const [blockNumber, pendingDacs] = await Promise.all([
        this.web3.eth.getBlockNumber(),
        getPendingDacs(this.app),
      ]);

      pendingDacs.forEach(d => updateDACIfFailed(blockNumber, d));
    } catch (e) {
      logger.error(e);
    }
  }

  async checkPendingCampaigns() {
    const updateCampaignIfFailed = async (currentBlock, campaign) => {
      if (!campaign.txHash) return;

      const receipt = await this.web3.eth.getTransactionReceipt(campaign.txHash);
      // reset the campaign status if the tx has been pending for more then 2 hrs, otherwise ignore
      if (!receipt && campaign.updatedAt <= Date.now() - TWO_HOURS) return;
      // ignore if there isn't enough confirmations
      if (receipt && currentBlock - receipt.blockNumber < this.requiredConfirmations) return;

      if (!receipt || !receipt.status) {
        // if status !== pending, then the cancel campaign transaction failed, so reset
        const mutation =
          campaign.status === CampaignStatus.PENDING
            ? { status: CampaignStatus.FAILED }
            : { status: CampaignStatus.ACTIVE, mined: true };

        this.app
          .service('campaigns')
          .patch(campaign._id, mutation)
          .catch(logger.error);
        return;
      }

      const topics = [
        { name: 'ProjectAdded', hash: this.web3.utils.keccak256('ProjectAdded(uint64,string)') },
        { name: 'CancelProject', hash: this.web3.utils.keccak256('CancelProject(uint256)') },
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
        this.emit(this.LP_EVENT, this.decoders.lp[topic.name](log));
      });
    };

    try {
      const [blockNumber, pendingCampaigns] = await Promise.all([
        this.web3.eth.getBlockNumber(),
        getPendingCampaigns(this.app),
      ]);

      pendingCampaigns.forEach(c => updateCampaignIfFailed(blockNumber, c));
    } catch (e) {
      logger.error(e);
    }
  }

  async checkPendingMilestones() {
    const updateMilestoneIfFailed = async (currentBlock, milestone) => {
      if (!milestone.txHash) return; // we can't revert

      const receipt = await this.web3.eth.getTransactionReceipt(milestone.txHash);
      // reset the milestone status if the tx has been pending for more then 2 hrs, otherwise ignore
      if (!receipt && milestone.updatedAt <= Date.now() - TWO_HOURS) return;
      // ignore if there isn't enough confirmations
      if (receipt && currentBlock - receipt.blockNumber < this.requiredConfirmations) return;

      if (!receipt || !receipt.status) {
        // Here we simply revert back to the previous state of the milestone
        this.app
          .service('milestones')
          .patch(milestone._id, {
            status: milestone.prevStatus,
            mined: true,
          })
          .catch(logger.error);
        return;
      }

      const topics = [
        { name: 'ProjectAdded', hash: this.web3.utils.keccak256('ProjectAdded(uint64,string)') },
        { name: 'CancelProject', hash: this.web3.utils.keccak256('CancelProject(uint256)') },
        {
          name: 'MilestoneCompleteRequested',
          hash: this.web3.utils.keccak256('MilestoneCompleteRequested(address,uint64)'),
        },
        {
          name: 'MilestoneCompleteRequestRejected',
          hash: this.web3.utils.keccak256('MilestoneCompleteRequested(address,uint64)'),
        },
        {
          name: 'MilestoneCompleteRequestApproved',
          hash: this.web3.utils.keccak256('MilestoneCompleteRequestApproved(address,uint64)'),
        },
        {
          name: 'MilestoneChangeReviewerRequested',
          hash: this.web3.utils.keccak256(
            'MilestoneChangeReviewerRequested(address,uint64,address)',
          ),
        },
        {
          name: 'MilestoneReviewerChanged',
          hash: this.web3.utils.keccak256('MilestoneReviewerChanged(address,uint64,address)'),
        },
        {
          name: 'MilestoneChangeCampaignReviewerRequested',
          hash: this.web3.utils.keccak256(
            'MilestoneChangeCampaignReviewerRequested(address,uint64,address)',
          ),
        },
        {
          name: 'MilestoneCampaignReviewerChanged',
          hash: this.web3.utils.keccak256(
            'MilestoneCampaignReviewerChanged(address,uint64,address)',
          ),
        },
        {
          name: 'MilestoneChangeRecipientRequested',
          hash: this.web3.utils.keccak256(
            'MilestoneChangeRecipientRequested(address,uint64,address)',
          ),
        },
        {
          name: 'MilestoneRecipientChanged',
          hash: this.web3.utils.keccak256('MilestoneRecipientChanged(address,uint64,address)'),
        },
        {
          name: 'PaymentCollected',
          hash: this.web3.utils.keccak256('PaymentCollected(address,uint64)'),
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
          this.emit(this.MILESTONE_EVENT, this.decoders.milestone[topic.name](log));
        } else {
          this.emit(this.LP_EVENT, this.decoders.lp[topic.name](log));
        }
      });
    };

    try {
      const [blockNumber, pendingMilestones] = await Promise.all([
        this.web3.eth.getBlockNumber(),
        getPendingMilestones(this.app),
      ]);

      pendingMilestones.forEach(m => updateMilestoneIfFailed(blockNumber, m));
    } catch (e) {
      logger.error(e);
    }
  }
}

module.exports = FailedTxMonitor;
