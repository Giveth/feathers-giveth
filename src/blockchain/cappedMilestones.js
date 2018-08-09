const logger = require('winston');
const { MilestoneStatus } = require('../models/milestones.model');

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
        const { from } = await app.getWeb3().eth.getTransaction(txHash);

        const {
          PAID,
          PAYING,
          CANCELED,
          NEEDS_REVIEW,
          REJECTED,
          IN_PROGRESS,
          COMPLETED,
        } = MilestoneStatus;

        // bug in contract will allow state to be "reverted"
        // we want to ignore that
        if (
          [PAYING, PAID, CANCELED, COMPLETED].includes(m.status) &&
          [NEEDS_REVIEW, REJECTED, IN_PROGRESS, CANCELED, COMPLETED].includes(status)
        ) {
          logger.info(
            'Ignoring milestone state reversion -> projectId:',
            projectId,
            '-> currentStatus:',
            data.status,
            '-> status:',
            status,
          );
          return;
        }

        await milestones.patch(
          m._id,
          {
            status,
            mined: true,
          },
          {
            eventTxHash: txHash,
            performedByAddress: from,
          },
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
    async reviewRequested(event) {
      if (event.event !== 'MilestoneCompleteRequested') {
        throw new Error('reviewRequested only handles MilestoneCompleteRequested events');
      }

      await updateMilestoneStatus(
        event.returnValues.idProject,
        MilestoneStatus.NEEDS_REVIEW,
        event.transactionHash,
      );
    },

    /**
     * handle `MilestoneCompleteRequestRejected` events
     *
     * @param {object} event Web3 event object
     */
    async rejected(event) {
      if (event.event !== 'MilestoneCompleteRequestRejected') {
        throw new Error('rejected only handles MilestoneCompleteRequestRejected events');
      }

      await updateMilestoneStatus(
        event.returnValues.idProject,
        MilestoneStatus.IN_PROGRESS,
        event.transactionHash,
      );
    },

    /**
     * handle `MilestoneCompleteRequestApproved` events
     *
     * @param {object} event Web3 event object
     */
    async accepted(event) {
      if (event.event !== 'MilestoneCompleteRequestApproved') {
        throw new Error('accepted only handles MilestoneCompleteRequestApproved events');
      }

      await updateMilestoneStatus(
        event.returnValues.idProject,
        MilestoneStatus.COMPLETED,
        event.transactionHash,
      );
    },

    /**
     * handle `PaymentCollected` events
     *
     * @param {object} event Web3 event object
     */
    async paymentCollected(event) {
      if (event.event !== 'PaymentCollected') {
        throw new Error('paymentCollected only handles PaymentCollected events');
      }

      await updateMilestoneStatus(
        event.returnValues.idProject,
        MilestoneStatus.PAID,
        event.transactionHash,
      );
    },
  };
};

module.exports = cappedMilestones;
