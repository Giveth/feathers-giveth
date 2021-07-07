const logger = require('winston');
const { toBN } = require('web3-utils');
const { TraceStatus } = require('../models/traces.model');
const { DonationStatus } = require('../models/donations.model');
const { CONVERSATION_MESSAGE_CONTEXT } = require('../models/conversations.model');
const { getTransaction } = require('./lib/web3Helpers');
const { donationsCollected } = require('../utils/dappMailer');
const { createRecipientChangedConversation } = require('../utils/conversationCreator');
const { sendTraceWithdrawEvent } = require('../utils/analyticsUtils');

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

const createPaymentConversationAndSendEmail = async ({ app, trace, txHash }) => {
  try {
    const traceId = trace._id;
    const { recipient, owner } = trace;

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
        ownerTypeId: traceId,
        status: DonationStatus.PAID,
        txHash,
      },
    });

    const payments = getDonationPaymentsByToken(donations);
    const conversation = await app.service('conversations').create(
      {
        traceId,
        messageContext: CONVERSATION_MESSAGE_CONTEXT.PAYMENT,
        txHash,
        payments,
        recipientAddress: (recipient && recipient.address) || owner.address,
      },
      { performedByAddress: donations[0].actionTakerAddress },
    );
    await donationsCollected(app, {
      trace,
      conversation,
    });
    sendTraceWithdrawEvent({ trace });
  } catch (e) {
    logger.error('createConversation and send collectedEmail error', e);
  }
};

/**
 * object factory to keep feathers cache in sync with trace contracts
 */
const tracesFactory = app => {
  const traces = app.service('traces');

  /**
   *
   * @param {string|int} projectId the liquidPledging adminId for this trace
   * @param {string} status The status to set
   * @param {string} txHash The txHash of the event that triggered this update
   */
  async function updateTraceStatus(projectId, status, txHash) {
    try {
      const data = await traces.find({ paginate: false, query: { projectId } });
      // only interested in traces we are aware of.
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
        } = TraceStatus;
        // bug in lpp-capped-trace contract will allow state to be "reverted"
        // we want to ignore that
        if (
          ([PAYING, PAID, CANCELED].includes(m.status) &&
            [NEEDS_REVIEW, REJECTED, IN_PROGRESS, CANCELED, COMPLETED].includes(status)) ||
          (m.status === COMPLETED && [REJECTED, IN_PROGRESS, CANCELED].includes(status))
        ) {
          logger.info(
            'Ignoring trace state reversion -> projectId:',
            projectId,
            '-> currentStatus:',
            m.status,
            '-> status:',
            status,
          );
          return null;
        }

        return traces.patch(
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
      logger.error('updateTraceStatus error', e);
      return null;
    }
  }

  /**
   *
   * @param {string|int} projectId the liquidPledging adminId for this trace
   * @param {string} recipient The address of the recipient
   * @param {string} txHash The txHash of the event that triggered this update
   */
  async function updateTraceRecipient(projectId, recipient, txHash) {
    try {
      const data = await traces.find({ paginate: false, query: { projectId } });
      // only interested in traces we are aware of.
      if (data.length === 1) {
        const m = data[0];
        const { from, timestamp } = await getTransaction(app, txHash);
        const traceId = m._id;
        const trace = await traces.patch(
          traceId,
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
        await createRecipientChangedConversation(app, {
          traceId,
          newRecipientAddress: recipient,
          timestamp,
          txHash,
          from,
        });
        return trace;
      }
      return null;
    } catch (e) {
      logger.error('Error trace patch:', e);
      return null;
    }
  }

  /**
   *
   * @param {string|int} projectId the liquidPledging adminId for this trace
   * @param {string} reviewer The address of the recipient
   * @param {string} txHash The txHash of the event that triggered this update
   */
  async function updateTraceReviewer(projectId, reviewer, txHash) {
    try {
      const data = await traces.find({ paginate: false, query: { projectId } });
      // only interested in traces we are aware of.
      if (data.length === 1) {
        const m = data[0];
        const { from } = await getTransaction(app, txHash);

        const trace = await traces.patch(
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
        return trace;
      }
      return null;
    } catch (e) {
      logger.error('Update trace reviewer:', e);
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

      return updateTraceStatus(
        event.returnValues.idProject,
        TraceStatus.NEEDS_REVIEW,
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

      return updateTraceStatus(
        event.returnValues.idProject,
        TraceStatus.IN_PROGRESS,
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

      return updateTraceStatus(
        event.returnValues.idProject,
        TraceStatus.COMPLETED,
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

      return updateTraceReviewer(
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

      return updateTraceRecipient(
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

      const matchingTraces = await traces.find({ paginate: false, query: { projectId } });

      if (matchingTraces.length !== 1) {
        logger.info(
          `Could not find a single trace with projectId: ${projectId}, found: ${matchingTraces.map(
            m => m._id,
          )}`,
        );
        return null;
      }
      const matchedTrace = matchingTraces[0];

      const donations = await app.service('donations').find({
        paginate: false,
        query: {
          status: { $in: [DonationStatus.COMMITTED, DonationStatus.PAYING] },
          amountRemaining: { $ne: '0' },
          ownerTypeId: matchedTrace._id,
        },
      });

      // if there are still committed donations, don't mark the as paid or paying
      if (donations.length > 0) return null;

      await createPaymentConversationAndSendEmail({
        app,
        trace: matchedTrace,
        txHash: event.transactionHash,
      });

      // if (!trace.maxAmount || !trace.fullyFunded) return;
      // never set uncapped or non-fullyFunded traces as PAID
      if (!matchedTrace.maxAmount || !matchedTrace.fullyFunded) return null;
      return updateTraceStatus(projectId, TraceStatus.PAID, event.transactionHash);
    },
  };
};

module.exports = tracesFactory;
