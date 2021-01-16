const logger = require('winston');
const { toBN } = require('web3-utils');
const { MilestoneStatus } = require('../models/milestones.model');
const { DonationStatus } = require('../models/donations.model');
const { getTransaction } = require('./lib/web3Helpers');
const { donationsCollected } = require('../utils/dappMailer');

const getDonationPaymentsByToken = donations => {
  const tokens = {};
  donations.forEach(donation => {
    const { amount, token } = donation;
    const { symbol, decimals } = token;
    if (tokens[symbol]) {
      tokens[symbol].amount = toBN(tokens[symbol].amount)
        .add(toBN(amount))
        .toString();
    } else {
      tokens[symbol] = {
        amount,
        decimals,
      };
    }
  });
  const payments = Object.keys(tokens).map(symbol => {
    return {
      symbol,
      amount: tokens[symbol].amount,
      decimals: tokens[symbol].decimals,
    };
  });
  return payments;
};

const createPaymentConversationAndSendEmail = async ({ app, milestone, txHash }) => {
  try {
    const milestoneId = milestone._id;
    const { recipient, campaignId, title, owner } = milestone;

    const paymentCollectedEvents = await app.service('events').find({
      paginate: false,
      query: {
        status: { $nin: ['Processed', 'Failed'] },
        event: 'PaymentCollected',
        transactionHash: txHash,
      },
    });
    if (paymentCollectedEvents.length !== 1) {
      // We should have one unprocessed paymentCollected event
      // if there is more than one it means this function will be call later
      // so this time we dond do anything
      // and paymentCollectedEvents.length  never can be zero
      return;
    }
    const donations = await app.service('donations').find({
      paginate: false,
      query: {
        ownerTypeId: milestoneId,
        status: DonationStatus.PAID,
        txHash,
      },
    });

    const payments = getDonationPaymentsByToken(donations);
    const conversation = await app.service('conversations').create(
      {
        milestoneId,
        messageContext: 'payment',
        txHash,
        payments,
        recipientAddress: recipient.address,
      },
      { performedByAddress: donations[0].actionTakerAddress },
    );
    // When the recipient is campaign then recipient.email and recipient.name is undefined
    // and  recipient is an address that doesnt have account in Giveth recipient is null
    // so below checking is for this purpose to send emails for milestone's owner instead of recipient
    const email = (recipient && recipient.email) || owner.email;
    const name = (recipient && recipient.name) || owner.name;
    if (email) {
      // now we dont send donations-collected email for milestones that don't have recipient
      await donationsCollected(app, {
        recipient: email,
        user: name,
        milestoneTitle: title,
        milestoneId,
        campaignId,
        conversation,
      });
    }
    logger.info(
      `Currently we dont send email for milestones who doesnt have recipient, milestoneId: ${milestoneId}`,
    );
  } catch (e) {
    logger.error('createConversation and send collectedEmail error', e);
  }
};

/**
 * object factory to keep feathers cache in sync with milestone contracts
 */
const milestonesFactory = app => {
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
        const { from } = await getTransaction(app, txHash);
        const {
          PAID,
          PAYING,
          CANCELED,
          NEEDS_REVIEW,
          REJECTED,
          IN_PROGRESS,
          COMPLETED,
        } = MilestoneStatus;
        // bug in lpp-capped-milestone contract will allow state to be "reverted"
        // we want to ignore that
        if (
          ([PAYING, PAID, CANCELED].includes(m.status) &&
            [NEEDS_REVIEW, REJECTED, IN_PROGRESS, CANCELED, COMPLETED].includes(status)) ||
          (m.status === COMPLETED && [REJECTED, IN_PROGRESS, CANCELED].includes(status))
        ) {
          logger.info(
            'Ignoring milestone state reversion -> projectId:',
            projectId,
            '-> currentStatus:',
            m.status,
            '-> status:',
            status,
          );
          return null;
        }

        return milestones.patch(
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
      return null;
    } catch (e) {
      logger.error('updateMilestoneStatus error', e);
      return null;
    }
  }

  /**
   *
   * @param {string|int} projectId the liquidPledging adminId for this milestone
   * @param {string} recipient The address of the recipient
   * @param {string} txHash The txHash of the event that triggered this update
   */
  async function updateMilestoneRecipient(projectId, recipient, txHash) {
    try {
      const data = await milestones.find({ paginate: false, query: { projectId } });
      // only interested in milestones we are aware of.
      if (data.length === 1) {
        const m = data[0];
        const { from } = await getTransaction(app, txHash);
        const milestone = await milestones.patch(
          m._id,
          {
            recipientAddress: recipient,
            $unset: { pendingRecipientAddress: true },
            mined: true,
          },
          {
            eventTxHash: txHash,
            performedByAddress: from,
          },
        );
        return milestone;
      }
      return null;
    } catch (e) {
      logger.error('Error milestone patch:', e);
      return null;
    }
  }

  /**
   *
   * @param {string|int} projectId the liquidPledging adminId for this milestone
   * @param {string} reviewer The address of the recipient
   * @param {string} txHash The txHash of the event that triggered this update
   */
  async function updateMilestoneReviewer(projectId, reviewer, txHash) {
    try {
      const data = await milestones.find({ paginate: false, query: { projectId } });
      // only interested in milestones we are aware of.
      if (data.length === 1) {
        const m = data[0];
        const { from } = await getTransaction(app, txHash);

        const milestone = await milestones.patch(
          m._id,
          {
            reviewerAddress: reviewer,
            mined: true,
          },
          {
            eventTxHash: txHash,
            performedByAddress: from,
          },
        );
        return milestone;
      }
      return null;
    } catch (e) {
      logger.error('Update milestone reviewer:', e);
      return null;
    }
  }

  return {
    /**
     * handle `MilestoneCompleteRequested` and `RequestReview` events
     *
     * @param {object} event Web3 event object
     */
    async reviewRequested(event) {
      if (!['MilestoneCompleteRequested', 'RequestReview'].includes(event.event)) {
        throw new Error(
          'reviewRequested only handles MilestoneCompleteRequested and RequestReview events',
        );
      }

      return updateMilestoneStatus(
        event.returnValues.idProject,
        MilestoneStatus.NEEDS_REVIEW,
        event.transactionHash,
      );
    },

    /**
     * handle `MilestoneCompleteRequestRejected` and `RejectCompleted` events
     *
     * @param {object} event Web3 event object
     */
    async rejected(event) {
      if (!['MilestoneCompleteRequestRejected', 'RejectCompleted'].includes(event.event)) {
        throw new Error(
          'rejected only handles MilestoneCompleteRequestRejected and RejectCompleted events',
        );
      }

      return updateMilestoneStatus(
        event.returnValues.idProject,
        MilestoneStatus.IN_PROGRESS,
        event.transactionHash,
      );
    },

    /**
     * handle `MilestoneCompleteRequestApproved` and `ApproveCompleted` events
     *
     * @param {object} event Web3 event object
     */
    async accepted(event) {
      if (!['MilestoneCompleteRequestApproved', 'ApproveCompleted'].includes(event.event)) {
        throw new Error(
          'accepted only handles MilestoneCompleteRequestApproved and ApproveCompleted events',
        );
      }

      return updateMilestoneStatus(
        event.returnValues.idProject,
        MilestoneStatus.COMPLETED,
        event.transactionHash,
      );
    },

    /**
     * handle `MilestoneReviewerChanged` and `ReviewerChanged` events
     *
     * @param {object} event Web3 event object
     */
    async reviewerChanged(event) {
      if (!['MilestoneReviewerChanged', 'ReviewerChanged'].includes(event.event)) {
        throw new Error(
          'accepted only handles MilestoneReviewerChanged and ReviewerChanged events',
        );
      }

      return updateMilestoneReviewer(
        event.returnValues.idProject,
        event.returnValues.reviewer,
        event.transactionHash,
      );
    },

    /**
     * handle `MilestoneRecipientChanged` and `RecipientChanged` events
     *
     * @param {object} event Web3 event object
     */
    async recipientChanged(event) {
      if (!['MilestoneRecipientChanged', 'RecipientChanged'].includes(event.event)) {
        throw new Error(
          'accepted only handles MilestoneRecipientChanged and RecipientChanged events',
        );
      }

      return updateMilestoneRecipient(
        event.returnValues.idProject,
        event.returnValues.recipient,
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

      const { idProject: projectId } = event.returnValues;

      const matchingMilestones = await milestones.find({ paginate: false, query: { projectId } });

      if (matchingMilestones.length !== 1) {
        logger.info(
          `Could not find a single milestone with projectId: ${projectId}, found: ${matchingMilestones.map(
            m => m._id,
          )}`,
        );
        return null;
      }
      const matchedMilestone = matchingMilestones[0];

      const donations = await app.service('donations').find({
        paginate: false,
        query: {
          status: { $in: [DonationStatus.COMMITTED, DonationStatus.PAYING] },
          amountRemaining: { $ne: '0' },
          ownerTypeId: matchedMilestone._id,
        },
      });

      // if there are still committed donations, don't mark the as paid or paying
      if (donations.length > 0) return null;

      await createPaymentConversationAndSendEmail({
        app,
        milestone: matchedMilestone,
        txHash: event.transactionHash,
      });

      // if (!milestone.maxAmount || !milestone.fullyFunded) return;
      // never set uncapped or non-fullyFunded milestones as PAID
      if (!matchedMilestone.maxAmount || !matchedMilestone.fullyFunded) return null;
      return updateMilestoneStatus(projectId, MilestoneStatus.PAID, event.transactionHash);
    },
  };
};

module.exports = milestonesFactory;
