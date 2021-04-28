const logger = require('winston');

const { DonationStatus } = require('../models/donations.model');
const { AdminTypes } = require('../models/pledgeAdmins.model');
const { CONVERSATION_MESSAGE_CONTEXT } = require('../models/conversations.model');
const Mailer = require('./dappMailer');
const { getTransaction } = require('../blockchain/lib/web3Helpers');
const { MilestoneStatus } = require('../models/milestones.model');
const { createDonatedConversation, createDelegatedConversation } = require('./conversationCreator');

const getPledgeAdmin = (app, type, id) => {
  switch (type) {
    case AdminTypes.DAC:
      return app.service('dacs').get(id);
    case AdminTypes.CAMPAIGN:
      return app.service('campaigns').get(id);
    case AdminTypes.MILESTONE:
      return app.service('milestones').get(id);
    default:
      return app.service('users').get(id);
  }
};

async function sendMilestoneProposedEmail(app, { milestone }) {
  try {
    await Mailer.milestoneProposed(app, {
      milestone,
    });
  } catch (e) {
    logger.error('error sending proposed milestone notification', e);
  }
}

/**
 *
 * Conditionally sends a notification after patch or create
 *
 * */
const handleMilestoneConversationAndEmail = () => async context => {
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
          milestoneId: _id,
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
          milestoneId: _id,
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
  } = MilestoneStatus;
  const { status, _id, prevStatus, message, mined } = result;
  logger.info('handleMilestoneConversationAndEmail() called', {
    milestoneId: _id,
    eventTxHash,
    status,
    prevStatus,
    method: context.method,
  });
  if (context.method === 'create' && status === PROPOSED) {
    await sendMilestoneProposedEmail(app, {
      milestone: result,
    });
    return;
  }

  if (context.method !== 'patch') {
    // The rest of code is for patch requests that update the status, so in this case we dont need to run it
    return;
  }

  /**
   * Generate Mailer and Conversations when a milestone is patched
   */

  /**
   * This only gets triggered when the txHash is received through a milestone event
   * Which basically means the event is really mined
   * */
  if (eventTxHash) {
    if (data.status === IN_PROGRESS && prevStatus === PROPOSED) {
      _createConversation(CONVERSATION_MESSAGE_CONTEXT.PROPOSED_ACCEPTED);
      Mailer.proposedMilestoneAccepted(app, {
        milestone: result,
        message,
      });
    } else if (status === PROPOSED && prevStatus === REJECTED) {
      await sendMilestoneProposedEmail(app, {
        milestone: result,
      });
    } else if (data.status === NEEDS_REVIEW) {
      // find the milestone reviewer owner and send a notification that this milestone is been marked as complete and needs review
      _createConversation(status);
      Mailer.milestoneRequestReview(app, {
        milestone: result,
        message,
      });
    } else if (status === COMPLETED && mined) {
      _createConversation(status);
      // find the milestone owner and send a notification that his/her milestone is marked complete
      Mailer.milestoneMarkedCompleted(app, {
        milestone: result,
        message,
      });
    } else if (data.status === IN_PROGRESS && prevStatus === NEEDS_REVIEW) {
      _createConversation(CONVERSATION_MESSAGE_CONTEXT.REJECTED);

      // find the milestone reviewer and send a notification that his/her milestone has been rejected by reviewer
      // it's possible to have a null reviewer if that address has never logged in
      // if (reviewer) {
      // TODO I think it was wrong that we were sending emails to reviewer in this case
      // TODO so I sent to milestone owner instead
      Mailer.milestoneReviewRejected(app, {
        milestone: result,
        message,
      });
      // }
    } else if (status === CANCELED && mined) {
      _createConversation(CONVERSATION_MESSAGE_CONTEXT.CANCELLED);

      // find the milestone owner and send a notification that his/her milestone is canceled
      Mailer.milestoneCanceled(app, {
        milestone: result,
        message,
      });
    }
  } else if (data.status === REJECTED && prevStatus === PROPOSED) {
    _createConversation(CONVERSATION_MESSAGE_CONTEXT.PROPOSED_REJECTED);
    Mailer.proposedMilestoneRejected(app, {
      milestone: result,
      message,
    });
  } else if (data.status === PROPOSED && prevStatus === REJECTED) {
    _createConversation(CONVERSATION_MESSAGE_CONTEXT.RE_PROPOSE);
  } else if (result.status === PROPOSED && !prevStatus) {
    Mailer.proposedMilestoneEdited(app, {
      milestone: result,
      user,
    });
  } else if (data.status === ARCHIVED && prevStatus !== ARCHIVED) {
    // Completed and InProgress milestones could become archived
    _createConversation(CONVERSATION_MESSAGE_CONTEXT.ARCHIVED);
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

  // paid donations are handled by the milestone notifications
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
    // if this is a DAC or a campaign, then the donation needs delegation
    Mailer.requestDelegation(app, {
      recipient: pledgeAdmin.owner.email,
      user: pledgeAdmin.owner.name,
      donationType: delegateType || ownerType, // dac / campaign
      donatedToTitle: pledgeAdmin.title || pledgeAdmin.name,
      amount,
      token,
    });
  } else {
    // if this is a milestone then no action is required

    // pledge = donation, pledgeAdmin= milestone,  performedByAddress:pledge.actionTakerAddress
    Mailer.milestoneReceivedDonation(app, {
      milestone: pledgeAdmin,
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
        milestoneId: pledgeAdmin._id,
        donationId: donation._id,
        homeTxHash,
        payment,
        giverAddress,
        actionTakerAddress,
      });
    } else {
      await createDelegatedConversation(app, {
        milestoneId: pledgeAdmin._id,
        donationId: donation._id,
        txHash,
        payment,
        parentDonations,
        actionTakerAddress,
      });
    }
  }
};

module.exports = {
  getPledgeAdmin,

  handleDonationConversationAndEmail,
  handleMilestoneConversationAndEmail,
};
