import LiquidPledgingArtifact from 'giveth-liquidpledging/build/LiquidPledging.json';
import LPVaultArtifact from 'giveth-liquidpledging/build/LPVault.json';
import LPPCappedMilestoneArtifact from 'lpp-capped-milestone/build/LPPCappedMilestone.json';
import EventEmitter from 'events';
import logger from 'winston';

const FIFTEEN_MINUTES = 1000 * 60 * 15;
const TWO_HOURS = 1000 * 60 * 60 * 2;

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

    this.decoders = {
      lp: {},
      vault: {},
      milestone: {},
    };
  }

  start() {
    this.setDecoders();

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

  setDecoders() {
    LiquidPledgingArtifact.compilerOutput.abi
      .filter(method => method.type === 'event')
      .forEach(event => {
        this.decoders.lp[event.name] = this.web3.eth.Contract.prototype._decodeEventABI.bind(event);
      });

    LPVaultArtifact.compilerOutput.abi.filter(method => method.type === 'event').forEach(event => {
      this.decoders.vault[event.name] = this.web3.eth.Contract.prototype._decodeEventABI.bind(
        event,
      );
    });

    LPPCappedMilestoneArtifact.compilerOutput.abi
      .filter(method => method.type === 'event')
      .forEach(event => {
        this.decoders.milestone[event.name] = this.web3.eth.Contract.prototype._decodeEventABI.bind(
          event,
        );
      });
  }

  checkPendingDonations() {
    const donations = this.app.service('donations');

    const revertDonationIfFailed = (currentBlock, donation) => {
      if (!donation.previousState || !donation.txHash) return;

      this.web3.eth.getTransactionReceipt(donation.txHash).then(receipt => {
        if (!receipt) return;
        // ignore if there isn't enough confirmations
        if (currentBlock - receipt.blockNumber < this.requiredConfirmations) return;

        logger.info(receipt);
        if (!receipt.status) {
          donations
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
      });
    };

    Promise.all([
      this.web3.eth.getBlockNumber(),
      donations.find({
        paginate: false,
        query: {
          $or: [{ status: 'pending' }, { status: 'Pending' }],
        },
      }),
    ])
      .then(([blockNumber, pendingDonations]) =>
        pendingDonations.forEach(d => revertDonationIfFailed(blockNumber, d)),
      )
      .catch(logger.error);
  }

  checkPendingDACS() {
    const dacs = this.app.service('dacs');

    const updateDACIfFailed = (currentBlock, dac) => {
      if (!dac.txHash) return;

      this.web3.eth.getTransactionReceipt(dac.txHash).then(receipt => {
        if (!receipt) return;
        // ignore if there isn't enough confirmations
        if (currentBlock - receipt.blockNumber < this.requiredConfirmations) return;

        if (!receipt.status) {
          dacs
            .patch(dac._id, {
              status: 'failed',
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
      });
    };

    Promise.all([
      this.web3.eth.getBlockNumber(),
      dacs.find({
        paginate: false,
        query: {
          delegateId: { $ne: '0' },
        },
      }),
    ])
      .then(([blockNumber, pendingDACs]) =>
        pendingDACs.forEach(d => updateDACIfFailed(blockNumber, d)),
      )
      .catch(logger.error);
  }

  checkPendingCampaigns() {
    const campaigns = this.app.service('campaigns');

    const updateCampaignIfFailed = (currentBlock, campaign) => {
      if (!campaign.txHash) return;

      this.web3.eth.getTransactionReceipt(campaign.txHash).then(receipt => {
        if (!receipt) return;
        // ignore if there isn't enough confirmations
        if (currentBlock - receipt.blockNumber < this.requiredConfirmations) return;

        if (!receipt.status) {
          // if status !== pending, then the cancel campaign transaction failed, so reset
          const mutation =
            campaign.status === 'pending' || campaign.status === 'Pending'
              ? { status: 'failed' }
              : { status: 'Active', mined: true };

          campaigns.patch(campaign._id, mutation).catch(logger.error);
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
      });
    };

    Promise.all([
      this.web3.eth.getBlockNumber(),
      campaigns.find({
        paginate: false,
        query: {
          $or: [{ status: 'pending' }, { status: 'Pending' }, { mined: false }],
        },
      }),
    ])
      .then(([blockNumber, pendingCampaigns]) =>
        pendingCampaigns.forEach(c => updateCampaignIfFailed(blockNumber, c)),
      )
      .catch(logger.error);
  }

  checkPendingMilestones() {
    const milestones = this.app.service('milestones');

    const updateMilestoneIfFailed = (currentBlock, milestone) => {
      if (!milestone.txHash) return; // we can't revert

      this.web3.eth.getTransactionReceipt(milestone.txHash).then(receipt => {
        // TODO it is possible to get a txHash inserted & the tx to not exist (maybe a reorg?).
        // If that happens the transactionReceipt will be null, and the milestone, etc will be
        // in a perpetual "pending" state. We need to reset the milestone, etc if it has been pending
        // for more then x time (6 hrs?)
        // if (!receipt && milestone.updatedAt <= Date.now() - ) return;
        if (!receipt) return;
        // ignore if there isn't enough confirmations
        if (currentBlock - receipt.blockNumber < this.requiredConfirmations) return;

        if (!receipt.status) {
          // Here we simply revert back to the previous state of the milestone
          milestones
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
      });
    };

    Promise.all([
      this.web3.eth.getBlockNumber(),
      milestones.find({
        paginate: false,
        query: {
          $or: [{ status: 'pending' }, { status: 'Pending' }, { mined: false }],
        },
      }),
    ])
      .then(([blockNumber, pendingMilestones]) =>
        pendingMilestones.forEach(m => updateMilestoneIfFailed(blockNumber, m)),
      )
      .catch(logger.error);
  }
}

export default FailedTxMonitor;
