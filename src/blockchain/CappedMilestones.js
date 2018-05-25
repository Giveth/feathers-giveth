import logger from 'winston';

/**
 * class to keep feathers cache in sync with lpp-capped-milestone contracts
 */
class CappedMilestones {
  constructor(app, web3) {
    this.app = app;
    this.web3 = web3;
    this.milestones = this.app.service('milestones');
  }

  reviewRequested(event) {
    if (event.event !== 'MilestoneCompleteRequested')
      throw new Error('reviewRequested only handles MilestoneCompleteRequested events');

    this.updateMilestoneStatus(event.returnValues.idProject, 'NeedsReview', event.transactionHash);
  }

  rejected(event) {
    if (event.event !== 'MilestoneCompleteRequestRejected')
      throw new Error('rejected only handles MilestoneCompleteRequestRejected events');

    this.updateMilestoneStatus(event.returnValues.idProject, 'InProgress', event.transactionHash);
  }

  accepted(event) {
    if (event.event !== 'MilestoneCompleteRequestApproved')
      throw new Error('accepted only handles MilestoneCompleteRequestApproved events');

    this.updateMilestoneStatus(event.returnValues.idProject, 'Completed', event.transactionHash);
  }

  paymentCollected(event) {
    if (event.event !== 'PaymentCollected')
      throw new Error('paymentCollected only handles PaymentCollected events');

    this.updateMilestoneStatus(event.returnValues.idProject, 'Paid', event.transactionHash);
  }

  updateMilestoneStatus(projectId, status, txHash) {
    this.milestones
      .find({ query: { projectId } })
      .then(({ data }) => {
        // only interested in milestones we are aware of.
        if (data.length === 1) {
          const m = data[0];

          this.milestones.patch(m._id, {
            status,
            mined: true,
          }, { eventTxHash: txHash });
        }
      })
      .catch(logger.error);
  }
}

export default CappedMilestones;
