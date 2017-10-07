import { hexToNumber } from 'web3-utils';

/**
 * class to check if any transactions failed and to revert the ui state if so
 */
class FailedTxMonitor {
  constructor(web3, app) {
    this.web3 = web3;
    this.app = app;
  }

  start() {
    const FIFTEEN_MINUTES = 1000 * 60 * 15;

    setInterval(this.checkPendingDonations.bind(this), FIFTEEN_MINUTES);
    setInterval(this.checkPendingDACS.bind(this), FIFTEEN_MINUTES);
    setInterval(this.checkPendingCampaigns().bind(this), FIFTEEN_MINUTES);
    setInterval(this.checkPendingMilestones().bind(this), FIFTEEN_MINUTES);
  }

  checkPendingDonations() {
    const donations = this.app.service('donations');

    const revertDonationIfFailed = (donation) => {
      if (!donation.previousState && donation.txHash) return; // we can't revert

      this.web3.eth.getTransactionReceipt(donation.txHash)
        .then(receipt => {
          if (!receipt) return;

          // 0 status if failed tx
          if (hexToNumber(receipt.status) === 0) {
            return donations.patch(donation._id, Object.assign({}, donation.previousState, { $unset: { previousState: true } }))
              .catch(console.error);
          }

          console.error('donation has status === `pending` but transaction was successful donation:', donation, 'receipt:', receipt);
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
      if (dac.txHash) return; // we can't revert

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

          console.error('dac has no delegateId but transaction was successful dac:', dac, 'receipt:', receipt);
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
      if (campaign.txHash) return; // we can't revert

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

          console.error('campaign status === `pending` or mined === false but transaction was successful campaign:', campaign, 'receipt:', receipt);
        });
    };

    campaigns.find({
      paginate: false,
      query: {
        status: 'pending',
        mined: false
      }
    }).then(pendingDACs => pendingDACs.forEach(updateCampaignIfFailed))
      .catch(console.error); //eslint-disable-line no-console
  }

  checkPendingMilestones() {
    const milestones = this.app.service('milestones');

    const updateMilestoneIfFailed = (milestone) => {
      if (milestone.txHash) return; // we can't revert

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

          console.error('milestone status === `pending` or mined === false but transaction was successful milestone:', milestone, 'receipt:', receipt);
        });
    };

    milestones.find({
      paginate: false,
      query: {
        status: 'pending',
        mined: false
      }
    }).then(pendingMilestones => pendingMilestones.forEach(updateMilestoneIfFailed))
      .catch(console.error); //eslint-disable-line no-console
  }

}

export default FailedTxMonitor;
