const logger = require('winston');
const {
  sendProposedTraceRejectedEvent,
  sendTraceProposedEvent,
  sendTraceReproposedEvent,
  sendTraceArchivedEvent,
  sendProposedTraceEditedEvent,
  sendTraceCompletionApprovedEvent,
  sendTraceCompletionRejectedEvent,
  sendRequestTraceMarkCompletedEvent,
  sendTraceCancelledEvent,
  sendProposedTraceAcceptedEvent,
} = require('./analyticsUtils');

const { DonationStatus } = require('../models/donations.model');
const { AdminTypes } = require('../models/pledgeAdmins.model');
const { CONVERSATION_MESSAGE_CONTEXT } = require('../models/conversations.model');
const Mailer = require('./dappMailer');
const { getTransaction } = require('../blockchain/lib/web3Helpers');
const { TraceStatus } = require('../models/traces.model');
const { createDonatedConversation, createDelegatedConversation } = require('./conversationCreator');

const getPledgeAdmin = (app, type, id) => {
  switch (type) {
    case AdminTypes.COMMUNITY:
      return app.service('communities').get(id);
    case AdminTypes.CAMPAIGN:
      return app.service('campaigns').get(id);
    case AdminTypes.TRACE:
      return app.service('traces').get(id);
    default:
      return app.service('users').get(id);
  }
};

async function sendTraceProposedEmail(context, { trace }) {
  try {
    sendTraceProposedEvent({
      context,
      trace,
    });
    await Mailer.traceProposed(context.app, {
      trace,
    });
  } catch (e) {
    logger.error('error sending proposed trace notification', e);
  }
}

async function handleConversationForMinedEvents(
  data,
  IN_PROGRESS,
  prevStatus,
  PROPOSED,
  _createConversation,
  app,
  result,
  message,
  status,
  REJECTED,
  NEEDS_REVIEW,
  COMPLETED,
  mined,
  performedByAddress,
  CANCELED,
) {
  if (data.status === IN_PROGRESS && prevStatus === PROPOSED) {
    _createConversation(CONVERSATION_MESSAGE_CONTEXT.PROPOSED_ACCEPTED);
    Mailer.proposedTraceAccepted(app, {
      trace: result,
      message,
    });
    sendProposedTraceAcceptedEvent({ trace: result, userAddress: performedByAddress });
  } else if (status === PROPOSED && prevStatus === REJECTED) {
    await sendTraceProposedEmail(context, {
      trace: result,
    });
  } else if (data.status === NEEDS_REVIEW) {
    // find the trace reviewer owner and send a notification that this trace is been marked as complete and needs review
    _createConversation(status);
    Mailer.traceRequestReview(app, {
      trace: result,
      message,
    });
    sendRequestTraceMarkCompletedEvent({
      trace: result,
      userAddress: performedByAddress,
    });
  } else if (status === COMPLETED && mined) {
    _createConversation(status);
    // find the trace owner and send a notification that his/her trace is marked complete
    Mailer.traceMarkedCompleted(app, {
      trace: result,
      message,
    });
    // track({
    //   userAddress: performedByAddress,
    //   event: AnalyticsEvents.TraceCompletionApproved,
    //   metadata: data,
    // });
  } else if (data.status === IN_PROGRESS && prevStatus === NEEDS_REVIEW) {
    _createConversation(CONVERSATION_MESSAGE_CONTEXT.REJECTED);

    // find the trace reviewer and send a notification that his/her trace has been rejected by reviewer
    // it's possible to have a null reviewer if that address has never logged in
    // if (reviewer) {
    // TODO I think it was wrong that we were sending emails to reviewer in this case
    // TODO so I sent to trace owner instead
    Mailer.traceReviewRejected(app, {
      trace: result,
      message,
    });
    sendTraceCompletionRejectedEvent({
      trace: result,
      userAddress: performedByAddress,
    });
  } else if (status === CANCELED && mined) {
    _createConversation(CONVERSATION_MESSAGE_CONTEXT.CANCELLED);

    // find the trace owner and send a notification that his/her trace is canceled
    Mailer.traceCancelled(app, {
      trace: result,
      message,
    });
    sendTraceCancelledEvent({
      trace: result,
      userAddress: performedByAddress,
    });
    // track({
    //   userAddress: performedByAddress,
    //   event: AnalyticsEvents.TraceCancelled,
    //   metadata: data,
    // });
  }
}

/**
 *
 * Conditionally sends a notification after patch or create
 *
 * */
const handleTraceConversationAndEmail = () => async context => {
  const { data, app, result, params } = context;
  const { user } = params;
  const { performedByAddress, eventTxHash } = params;

  const _createConversation = async messageContext => {
    const service = app.service('conversations');
    const { proofItems, _id, message } = result;

    // Comment doesn't have hash value and other fields should not be unique
    if (messageContext !== CONVERSATION_MESSAGE_CONTEXT.COMMENT) {
      const similarConversations = await service.find({
        paginate: false,
        query: {
          traceId: _id,
          messageContext,
          txHash: eventTxHash,
        },
      });
      // Conversation has been created before
      if (similarConversations && similarConversations.length > 0) {
        return;
      }
    }

    let createdAt;
    try {
      const { timestamp } = await getTransaction(app, eventTxHash, false);
      createdAt = timestamp;
    } catch (e) {
      createdAt = new Date();
      logger.error(`Error on getting tx ${eventTxHash} info`, e);
    }

    try {
      const res = await service.create(
        {
          traceId: _id,
          message,
          items: proofItems,
          messageContext,
          txHash: eventTxHash,
          createdAt,
        },
        { performedByAddress },
      );
      logger.info('created conversation!', res._id);
    } catch (e) {
      logger.error('could not create conversation', e);
    }
  };
  const {
    REJECTED,
    COMPLETED,
    CANCELED,
    NEEDS_REVIEW,
    IN_PROGRESS,
    PROPOSED,
    ARCHIVED,
  } = TraceStatus;
  const { status, _id, prevStatus, message, mined } = result;
  logger.info('handleTraceConversationAndEmail() called', {
    traceId: _id,
    eventTxHash,
    status,
    prevStatus,
    method: context.method,
  });
  if (context.method === 'create' && status === PROPOSED) {
    await sendTraceProposedEmail(context, {
      trace: result,
    });
    return;
  }

  if (context.method !== 'patch') {
    // The rest of code is for patch requests that update the status, so in this case we dont need to run it
    return;
  }

  /**
   * Generate Mailer and Conversations when a trace is patched
   */

  /**
   * This only gets triggered when the txHash is received through a trace event
   * Which basically means the event is really mined
   * */
  if (eventTxHash) {
    await handleConversationForMinedEvents(
      data,
      IN_PROGRESS,
      prevStatus,
      PROPOSED,
      _createConversation,
      app,
      result,
      message,
      status,
      REJECTED,
      NEEDS_REVIEW,
      COMPLETED,
      mined,
      performedByAddress,
      CANCELED,
    );
  } else if (data.status === REJECTED && prevStatus === PROPOSED) {
    _createConversation(CONVERSATION_MESSAGE_CONTEXT.PROPOSED_REJECTED);
    Mailer.proposedTraceRejected(app, {
      trace: result,
      message,
    });
    sendProposedTraceRejectedEvent({
      userAddress: performedByAddress,
      context,
      trace: result,
    });
  } else if (data.status === PROPOSED && prevStatus === REJECTED) {
    _createConversation(CONVERSATION_MESSAGE_CONTEXT.RE_PROPOSE);
    sendTraceReproposedEvent({
      context,
      trace: result,
    });
  } else if (result.status === PROPOSED && !prevStatus) {
    Mailer.proposedTraceEdited(app, {
      trace: result,
      user,
    });
    sendProposedTraceEditedEvent({
      context,
      trace: result,
    });
  } else if (data.status === ARCHIVED && prevStatus !== ARCHIVED) {
    // Completed and InProgress traces could become archived
    _createConversation(CONVERSATION_MESSAGE_CONTEXT.ARCHIVED);
    sendTraceArchivedEvent({
      context,
      trace: result,
    });
  } else if (data.status === COMPLETED && prevStatus !== COMPLETED) {
    sendTraceCompletionApprovedEvent({
      context,
      trace: result,
    });
  }
};

/**
 *
 * Conditionally sends a notification for a pledge
 *
 * */
const handleDonationConversationAndEmail = async (app, donation) => {
  const {
    amount,
    token,
    actionTakerAddress,
    delegateType,
    commitTime,
    status,
    ownerTypeId,
    delegateTypeId,
    intendedProjectType,
    intendedProjectTypeId,
    txHash,
    ownerType,
    homeTxHash,
    giverAddress,
    parentDonations,
  } = donation;

  // paid donations are handled by the trace notifications
  if ([DonationStatus.PAYING, DonationStatus.PAID].includes(status)) return;
  const pledgeAdmin = await getPledgeAdmin(
    app,
    delegateType || ownerType,
    delegateTypeId || ownerTypeId,
  );

  // this is an initial donationrequestDelegation
  if (homeTxHash) {
    try {
      const giver = await app.service('users').get(giverAddress);

      // thank giver if they are registered
      if (giver.email) {
        Mailer.donationReceipt(app, {
          recipient: giver.email,
          user: giver.name,
          amount,
          token,
          donationType: delegateType || ownerType,
          donatedToTitle: pledgeAdmin.title || pledgeAdmin.name,
        });
      }
    } catch (e) {
      // ignore missing giver
    }
  }

  // pledge has been delegated, notify the giver
  if (status === DonationStatus.TO_APPROVE) {
    try {
      const giver = await app.service('users').get(giverAddress);

      if (giver.email) {
        const intendedAdmin = await getPledgeAdmin(app, intendedProjectType, intendedProjectTypeId);

        Mailer.donationDelegated(app, {
          recipient: giver.email,
          user: giver.name,
          delegationType: intendedProjectType,
          delegatedToTitle: intendedAdmin.title,
          delegateType,
          delegateTitle: pledgeAdmin.title || pledgeAdmin.name,
          commitTime,
          amount,
          token,
        });
      }
    } catch (e) {
      // ignore missing giver
    }
  } else if (delegateType || ownerType === AdminTypes.CAMPAIGN) {
    // notify the pledge admin
    // if this is a COMMUNITY or a campaign, then the donation needs delegation
    Mailer.requestDelegation(app, {
      recipient: pledgeAdmin.owner.email,
      user: pledgeAdmin.owner.name,
      donationType: delegateType || ownerType, // dac / campaign
      donatedToTitle: pledgeAdmin.title || pledgeAdmin.name,
      amount,
      token,
    });
  } else {
    // if this is a trace then no action is required

    // pledge = donation, pledgeAdmin= trace,  performedByAddress:pledge.actionTakerAddress
    Mailer.traceReceivedDonation(app, {
      trace: pledgeAdmin,
      amount,
      token,
    });
    const directDonation = Boolean(homeTxHash);
    const payment = {
      symbol: token.symbol,
      amount,
      decimals: token.decimals,
    };
    if (directDonation) {
      await createDonatedConversation(app, {
        traceId: pledgeAdmin._id,
        donationId: donation._id,
        homeTxHash,
        payment,
        giverAddress,
        actionTakerAddress,
      });
      // track({
      //   userAddress: actionTakerAddress,
      //   event: AnalyticsEvents.Donated,
      //   metadata: donation,
      // });
    } else {
      await createDelegatedConversation(app, {
        traceId: pledgeAdmin._id,
        donationId: donation._id,
        txHash,
        payment,
        parentDonations,
        actionTakerAddress,
      });
      // track({
      //   userAddress: actionTakerAddress,
      //   event: AnalyticsEvents.Delegated,
      //   metadata: donation,
      // });
    }
  }
};

module.exports = {
  getPledgeAdmin,

  handleDonationConversationAndEmail,
  handleTraceConversationAndEmail,
};
