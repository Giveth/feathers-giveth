import { hexToNumber } from 'web3-utils';
import LiquidPledgingArtifact from 'giveth-liquidpledging/build/LiquidPledging.json';
import LPVaultArtifact from 'giveth-liquidpledging/build/LPVault.json';
import LPPCappedMilestoneArtifact from 'lpp-capped-milestone/build/LPPCappedMilestone.json';
import EventEmitter from 'events';
import logger from 'winston';

const FIFTEEN_MINUTES = 1000 * 60 * 15;

/**
 * class to check if any transactions failed and to revert the ui state if so
 */
class FailedTxMonitor extends EventEmitter {
  constructor(web3, app) {
    super();
    this.web3 = web3;
    this.app = app;

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
  }

  close() {
    this.removeAllListeners();

    clearInterval(this.donationIntervalId);
    clearInterval(this.dacIntervalId);
    clearInterval(this.campaignIntervalId);
    clearInterval(this.milestoneIntervalId);
  }

  setDecoders() {
    LiquidPledgingArtifact.compilerOutput.api
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

    const revertDonationIfFailed = donation => {
      if (!donation.previousState || !donation.txHash) return;

      this.web3.eth.getTransactionReceipt(donation.txHash).then(receipt => {
        if (!receipt) return;

        // 0 status if failed tx
        logger.info(receipt);
        if (hexToNumber(receipt.status) === 0) {
          donations
            .patch(
              donation._id,
              Object.assign({}, donation.previousState, { $unset: { previousState: true } }),
            )
            .catch(logger.error);
          return;
        }

        const topics = [
          { name: 'Transfer', hash: this.web3.utils.keccak256('Transfer(uint64,uint64,uint256)') },
          {
            name: 'AuthorizePayment',
            hash: this.web3.utils.keccak256('AuthorizePayment(uint256,bytes32,address,uint256)'),
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

    donations
      .find({
        paginate: false,
        query: {
          $or: [{ status: 'pending' }, { status: 'Pending' }],
        },
      })
      .then(pendingDonations => pendingDonations.forEach(revertDonationIfFailed))
      .catch(logger.error);
  }

  checkPendingDACS() {
    const dacs = this.app.service('dacs');

    const updateDACIfFailed = dac => {
      if (!dac.txHash) return;

      this.web3.eth.getTransactionReceipt(dac.txHash).then(receipt => {
        if (!receipt) return;

        // 0 status if failed tx
        if (hexToNumber(receipt.status) === 0) {
          dacs
            .patch(dac._id, {
              status: 'failed',
            })
            .catch(logger.error);

          return;
        }

        const topics = [
          { name: 'DelegateAdded', hash: this.web3.utils.keccak256('DelegateAdded(uint64)') },
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

    dacs
      .find({
        paginate: false,
        query: {
          $not: { delegateId: { $gt: '0' } },
        },
      })
      .then(pendingDACs => pendingDACs.forEach(updateDACIfFailed))
      .catch(logger.error);
  }

  checkPendingCampaigns() {
    const campaigns = this.app.service('campaigns');

    const updateCampaignIfFailed = campaign => {
      if (!campaign.txHash) return;

      this.web3.eth.getTransactionReceipt(campaign.txHash).then(receipt => {
        if (!receipt) return;

        // 0 status if failed tx
        if (hexToNumber(receipt.status) === 0) {
          // if status !== pending, then the cancel campaign transaction failed, so reset
          const mutation =
            campaign.status === 'pending' || campaign.status === 'Pending'
              ? { status: 'failed' }
              : { status: 'Active', mined: true };

          campaigns.patch(campaign._id, mutation).catch(logger.error);
          return;
        }

        const topics = [
          { name: 'ProjectAdded', hash: this.web3.utils.keccak256('ProjectAdded(uint64)') },
          { name: 'CancelProject', hash: this.web3.utils.keccak256('CancelProject(uint64)') },
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

    campaigns
      .find({
        paginate: false,
        query: {
          $or: [{ status: 'pending' }, { status: 'Pending' }, { mined: false }],
        },
      })
      .then(pendingCampaigns => pendingCampaigns.forEach(updateCampaignIfFailed))
      .catch(logger.error);
  }

  checkPendingMilestones() {
    const milestones = this.app.service('milestones');

    const updateMilestoneIfFailed = milestone => {
      if (!milestone.txHash) return; // we can't revert

      this.web3.eth.getTransactionReceipt(milestone.txHash).then(receipt => {
        if (!receipt) return;

        // 0 status if failed tx
        if (hexToNumber(receipt.status) === 0) {
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
          { name: 'ProjectAdded', hash: this.web3.utils.keccak256('ProjectAdded(uint64)') },
          { name: 'CancelProject', hash: this.web3.utils.keccak256('CancelProject(uint64)') },
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
            hash: this.web3.utils.keccak256('MilestoneChangeReviewerRequested(address,uint64)'),
          },
          {
            name: 'MilestoneReviewerChanged',
            hash: this.web3.utils.keccak256('MilestoneReviewerChanged(address,uint64)'),
          },
          {
            name: 'MilestoneChangeRecipientRequested',
            hash: this.web3.utils.keccak256('MilestoneChangeRecipientRequested(address,uint64)'),
          },
          {
            name: 'MilestoneRecipientChanged',
            hash: this.web3.utils.keccak256('MilestoneRecipientChanged(address,uint64)'),
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

    milestones
      .find({
        paginate: false,
        query: {
          $or: [{ status: 'pending' }, { status: 'Pending' }, { mined: false }],
        },
      })
      .then(pendingMilestones => pendingMilestones.forEach(updateMilestoneIfFailed))
      .catch(logger.error);
  }
}

export default FailedTxMonitor;
