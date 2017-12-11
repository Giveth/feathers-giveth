import { hexToNumber } from 'web3-utils';
import { LiquidPledgingAbi } from 'liquidpledging/build/LiquidPledging.sol';
import { LPVaultAbi } from 'liquidpledging/build/LPVault.sol';
import { LPPMilestoneAbi } from 'lpp-milestone/build/LPPMilestone.sol';
import EventEmitter from 'events';

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
      milestone: {}
    };
  }

  start() {
    this._setDecoders();
    const FIFTEEN_MINUTES = 1000 * 60 * 15;

    setInterval(this.checkPendingDonations.bind(this), FIFTEEN_MINUTES);
    setInterval(this.checkPendingDACS.bind(this), FIFTEEN_MINUTES);
    setInterval(this.checkPendingCampaigns.bind(this), FIFTEEN_MINUTES);
    setInterval(this.checkPendingMilestones.bind(this), FIFTEEN_MINUTES);
  }

  _setDecoders() {
    LiquidPledgingAbi.filter(method => method.type === 'event')
      .forEach(event => this.decoders.lp[event.name] = this.web3.eth.Contract.prototype._decodeEventABI.bind(event));

    LPVaultAbi.filter(method => method.type === 'event')
      .forEach(event => this.decoders.vault[event.name] = this.web3.eth.Contract.prototype._decodeEventABI.bind(event));

    LPPMilestoneAbi.filter(method => method.type === 'event')
      .forEach(event => this.decoders.milestone[event.name] = this.web3.eth.Contract.prototype._decodeEventABI.bind(event));
  }

  checkPendingDonations() {
    const donations = this.app.service('donations');

    const revertDonationIfFailed = (donation) => {
      if (!donation.previousState || !donation.txHash) return;

      this.web3.eth.getTransactionReceipt(donation.txHash)
        .then(receipt => {
          if (!receipt) return;

          // 0 status if failed tx
          console.log(receipt);
          if (hexToNumber(receipt.status) === 0) {
            return donations.patch(donation._id, Object.assign({}, donation.previousState, { $unset: { previousState: true } }))
              .catch(console.error);
          }

          const topics = [
            { name: 'Transfer', hash: this.web3.utils.keccak256('Transfer(uint64,uint64,uint256)') },
            { name: 'AuthorizePayment', hash: this.web3.utils.keccak256('AuthorizePayment(uint256,bytes32,address,uint256)')},
          ];

          // get logs we're interested in.
          const logs = receipt.logs.filter(log => {
            return topics.some(t => t.hash === log.topics[0]);
          });

          if (logs.length === 0) {
            console.error('donation has status === `pending` but transaction was successful donation:', donation, 'receipt:', receipt);
          }

          logs.forEach(log => {
            console.info('donation has status === `pending` but transaction was successful. re-emitting event donation:', donation, 'receipt:', receipt);

            const topic = topics.find(t => t.hash === log.topics[0]);

            if (topic.name === 'AuthorizePayment') {
              this.emit(this.VAULT_EVENT, this.decoders.vault[ topic.name ](log));
            } else {
              this.emit(this.LP_EVENT, this.decoders.lp[ topic.name ](log));
            }
          });
        });
    };

    donations.find({
      paginate: false,
      query: {
        status: 'pending'
      }
    }).then(pendingDonations => pendingDonations.forEach(revertDonationIfFailed))
      .catch(console.error); //eslint-disable-line no-console
  }

  checkPendingDACS() {
    const dacs = this.app.service('dacs');

    const updateDACIfFailed = (dac) => {
      if (!dac.txHash) return;

      this.web3.eth.getTransactionReceipt(dac.txHash)
        .then(receipt => {
          if (!receipt) return;

          // 0 status if failed tx
          if (hexToNumber(receipt.status) === 0) {
            return dacs.patch(dac._id, {
              status: 'failed'
            })
              .catch(console.error);
          }

          const topics = [
            { name: 'DelegateAdded', hash: this.web3.utils.keccak256('DelegateAdded(uint64)') },
          ];

          // get logs we're interested in.
          const logs = receipt.logs.filter(log => {
            return topics.some(t => t.hash === log.topics[0]);
          });

          if (logs.length === 0) {
            console.error('dac has no delegateId but transaction was successful dac:', dac, 'receipt:', receipt);
          }

          logs.forEach(log => {
            console.info('dac has no delegateId but transaction was successful. re-emitting AddDelegate event. dac:', dac, 'receipt:', receipt);

            const topic = topics.find(t => t.hash === log.topics[0]);
            this.emit(this.LP_EVENT, this.decoders.lp[ topic.name ](log));
          });
        });
    };

    dacs.find({
      paginate: false,
      query: {
        $not: { delegateId: { $gt: '0' } }
      }
    }).then(pendingDACs => pendingDACs.forEach(updateDACIfFailed))
      .catch(console.error); //eslint-disable-line no-console
  }

  checkPendingCampaigns() {
    const campaigns = this.app.service('campaigns');

    const updateCampaignIfFailed = (campaign) => {
      if (!campaign.txHash) return;

      this.web3.eth.getTransactionReceipt(campaign.txHash)
        .then(receipt => {
          if (!receipt) return;

          // 0 status if failed tx
          if (hexToNumber(receipt.status) === 0) {
            // if status !== pending, then the cancel campaign transaction failed, so reset
            const mutation = (campaign.status === 'pending') ? { status: 'failed' } : { status: 'Active', mined: true };

            return campaigns.patch(campaign._id, mutation)
              .catch(console.error);
          }

          const topics = [
            { name: 'ProjectAdded', hash: this.web3.utils.keccak256('ProjectAdded(uint64)') },
            { name: 'CancelProject', hash: this.web3.utils.keccak256('CancelProject(uint64)')},
          ];

          // get logs we're interested in.
          const logs = receipt.logs.filter(log => {
            return topics.some(t => t.hash === log.topics[0]);
          });

          if (logs.length === 0) {
            console.error('campaign status === `pending` or mined === false but transaction was successful campaign:', campaign, 'receipt:', receipt);
          }

          logs.forEach(log => {
            console.info('campaign status === `pending` or mined === false but transaction was successful. re-emitting event. campaign:', campaign, 'receipt:', receipt);

            const topic = topics.find(t => t.hash === log.topics[0]);
            this.emit(this.LP_EVENT, this.decoders.lp[ topic.name ](log));
          });
        });
    };

    campaigns.find({
      paginate: false,
      query: {
        $or: [
          { status: 'pending' },
          { mined: false }
        ]
      }
    }).then(pendingCampaigns => pendingCampaigns.forEach(updateCampaignIfFailed))
      .catch(console.error); //eslint-disable-line no-console
  }

  checkPendingMilestones() {
    const milestones = this.app.service('milestones');

    const updateMilestoneIfFailed = (milestone) => {
      if (!milestone.txHash) return; // we can't revert

      this.web3.eth.getTransactionReceipt(milestone.txHash)
        .then(receipt => {
          if (!receipt) return;

          // 0 status if failed tx
          if (hexToNumber(receipt.status) === 0) {
            let mutation;

            if (milestone.status === 'pending') {
              // was never created in liquidPledging
              mutation = { status: 'failed' };
            } else if (['Completed', 'Canceled'].includes(milestone.status)) {
              // if canceled, it's possible that the milestone was markedComplete, but b/c that process is off-chain
              // we just reset to InProgress, and the recipient can mark complete again.
              mutation = { status: 'InProgress', mined: true };
            } else if (milestone.status === 'Paying') {
              mutation = { status: 'Completed', mined: true };
            } else if (milestone.status === 'Paid') {
              mutation = { status: 'CanWithdraw', mined: true };
            }

            return milestones.patch(milestone._id, mutation)
              .catch(console.error);
          }

          const topics = [
            { name: 'ProjectAdded', hash: this.web3.utils.keccak256('ProjectAdded(uint64)') },
            { name: 'MilestoneAccepted', hash: this.web3.utils.keccak256('MilestoneAccepted(address)') },
            { name: 'CancelProject', hash: this.web3.utils.keccak256('CancelProject(uint64)')},
          ];

          // get logs we're interested in.
          const logs = receipt.logs.filter(log => {
            return topics.some(t => t.hash === log.topics[0]);
          });

          if (logs.length === 0) {
            console.error('milestone status === `pending` or mined === false but transaction was successful milestone:', milestone, 'receipt:', receipt);
          }

          logs.forEach(log => {
            console.info('milestone status === `pending` or mined === false but transaction was successful. re-emitting event. milestone:', milestone, 'receipt:', receipt);

            const topic = topics.find(t => t.hash === log.topics[0]);

            if (topic.name === 'MilestoneAccepted') {
              this.emit(this.MILESTONE_EVENT, this.decoders.milestone[topic.name](log));
            } else {
              this.emit(this.LP_EVENT, this.decoders.lp[ topic.name ](log));
            }
          });
        });
    };

    milestones.find({
      paginate: false,
      query: {
        $or: [
          { status: 'pending' },
          { mined: false }
        ]
      }
    }).then(pendingMilestones => pendingMilestones.forEach(updateMilestoneIfFailed))
      .catch(console.error); //eslint-disable-line no-console
  }

}

export default FailedTxMonitor;
