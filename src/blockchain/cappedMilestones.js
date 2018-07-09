const logger = require('winston');

/**
 * object factory to keep feathers cache in sync with lpp-capped-milestone contracts
 */
const cappedMilestones = app => {
  const milestones = app.service('milestones');

  /**
   *
   * @param {string|int} projectId the liquidPledging adminId for this milestone
   * @param {string} status The status to set
   * @param {string} txHash The txHash of the event that triggered this update
   */
  async function updateMilestoneStatus(projectId, status, txHash) {
    try {
      const data = await milestones.find({ paginate: false, query: { projectId } });
      // only interested in milestones we are aware of.
      if (data.length === 1) {
        const m = data[0];

        milestones.patch(
          m._id,
          {
            status,
            mined: true,
          },
          { eventTxHash: txHash },
        );
      }
    } catch (e) {
      logger.error(e);
    }
  }

  return {
    /**
     * handle `MilestoneCompleteRequested` events
     *
     * @param {object} event Web3 event object
     */
    reviewRequested(event) {
      if (event.event !== 'MilestoneCompleteRequested') {
        throw new Error('reviewRequested only handles MilestoneCompleteRequested events');
      }

      updateMilestoneStatus(event.returnValues.idProject, 'NeedsReview', event.transactionHash);
    },

    /**
     * handle `MilestoneCompleteRequestRejected` events
     *
     * @param {object} event Web3 event object
     */
    rejected(event) {
      if (event.event !== 'MilestoneCompleteRequestRejected') {
        throw new Error('rejected only handles MilestoneCompleteRequestRejected events');
      }

      updateMilestoneStatus(event.returnValues.idProject, 'InProgress', event.transactionHash);
    },

    /**
     * handle `MilestoneCompleteRequestApproved` events
     *
     * @param {object} event Web3 event object
     */
    accepted(event) {
      if (event.event !== 'MilestoneCompleteRequestApproved') {
        throw new Error('accepted only handles MilestoneCompleteRequestApproved events');
      }

      updateMilestoneStatus(event.returnValues.idProject, 'Completed', event.transactionHash);
    },

    /**
     * handle `PaymentCollected` events
     *
     * @param {object} event Web3 event object
     */
    paymentCollected(event) {
      if (event.event !== 'PaymentCollected') {
        throw new Error('paymentCollected only handles PaymentCollected events');
      }

      updateMilestoneStatus(event.returnValues.idProject, 'Paid', event.transactionHash);
    },
  };
};

module.exports = cappedMilestones;
