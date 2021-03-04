const logger = require('winston');

const { DonationStatus } = require('../models/donations.model');
const { AdminTypes } = require('../models/pledgeAdmins.model');
const { CONVERSATION_MESSAGE_CONTEXT } = require('../models/conversations.model');
const Mailer = require('./dappMailer');
const { getTransaction } = require('../blockchain/lib/web3Helpers');
const { MilestoneStatus } = require('../models/milestones.model');

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

async function sendMilestoneCreatedEmail(
  app,
  { _id, campaignId, milestoneTitle, maxAmount, token, recipientAddress },
) {
  try {
    const { email, name } = await app.service('users').get(recipientAddress);
    Mailer.milestoneCreated(app, {
      recipient: email,

      user: name,
      milestoneTitle,
      milestoneId: _id,
      campaignId,
      amount: maxAmount,
      token,
    });
  } catch (e) {
    // ignore missing recipient
  }
}

/**
 *
 * Conditionally sends a notification after patch or create
 *
 * */
const handleMilestoneConversationAndEmail = () => async context => {
  const { data, app, result, params } = context;
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
  const {
    status,
    title,
    _id,
    campaignId,
    maxAmount,
    token,
    prevStatus,
    owner,
    message,
    ownerAddress,
    recipientAddress,
    mined,
    // donationCounters,
    campaign,
    reviewer,
    // recipient,
  } = result;
  logger.info('sendNotification', { owner, status, prevStatus });
  if (context.method === 'create' && status === PROPOSED) {
    await sendMilestoneProposedEmail(app, {
      milestone: result,
    });
    return;
  }

  if (context.method !== 'patch' || !data.status) {
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

      // find the milestone owner and send a notification that his/her proposed milestone is approved
      Mailer.proposedMilestoneAccepted(app, {
        recipient: owner.email,
        user: owner.name,
        milestoneTitle: title,
        milestoneId: _id,
        campaignTitle: campaign.title,
        campaignId,
        // amount: maxAmount,
        message,
      });

      // milestone may have been created on the recipient's behalf
      // lets notify them if they are registered
      if (ownerAddress !== recipientAddress) {
        await sendMilestoneCreatedEmail(app, {
          recipientAddress: result.recipientAddress,
          milestoneTitle: data.title,
          maxAmount: data.maxAmount,
          token: data.token,
          _id,
          campaignId,
        });
      }
    } else if (status === PROPOSED && prevStatus === REJECTED) {
      await sendMilestoneProposedEmail(app, {
        title,
        _id,
        campaign,
        campaignId,
        maxAmount,
        token,
      });
    } else if (
      status === IN_PROGRESS &&
      prevStatus === PROPOSED &&
      ownerAddress !== recipientAddress
    ) {
      // milestone may have been created on the recipient's behalf
      // lets notify them if they are registered
      await sendMilestoneCreatedEmail(app, {
        recipientAddress: result.recipientAddress,
        milestoneTitle: data.title,
        maxAmount: data.maxAmount,
        token: data.token,
        _id,
        campaignId,
      });
    } else if (data.status === NEEDS_REVIEW) {
      // find the milestone reviewer owner and send a notification that this milestone is been marked as complete and needs review
      _createConversation(status);

      Mailer.milestoneRequestReview(app, {
        recipient: reviewer.email,
        user: reviewer.name,
        milestoneTitle: title,
        milestoneId: _id,
        campaignTitle: campaign.title,
        campaignId,
        message,
      });
    } else if (status === COMPLETED && mined) {
      _createConversation(status);

      // find the milestone owner and send a notification that his/her milestone is marked complete
      Mailer.milestoneMarkedCompleted(app, {
        recipient: owner.email,
        user: owner.name,
        milestoneTitle: title,
        milestoneId: _id,
        campaignTitle: campaign.title,
        campaignId,
        message,
        token,
      });
    } else if (data.status === IN_PROGRESS && prevStatus === NEEDS_REVIEW) {
      _createConversation(CONVERSATION_MESSAGE_CONTEXT.REJECTED);

      // find the milestone reviewer and send a notification that his/her milestone has been rejected by reviewer
      // it's possible to have a null reviewer if that address has never logged in
      if (reviewer) {
        Mailer.milestoneReviewRejected(app, {
          recipient: reviewer.email,
          user: reviewer.name,
          milestoneTitle: title,
          milestoneId: _id,
          campaignTitle: campaign.title,
          campaignId,
          message,
        });
      }
    } else if (status === CANCELED && mined) {
      _createConversation(CONVERSATION_MESSAGE_CONTEXT.CANCELLED);

      // find the milestone owner and send a notification that his/her milestone is canceled
      Mailer.milestoneCanceled(app, {
        recipient: owner.email,
        user: owner.name,
        milestoneTitle: title,
        milestoneId: _id,
        campaignTitle: campaign.title,
        campaignId,
        message,
      });
    }
  } else if (data.status === REJECTED && prevStatus === PROPOSED) {
    _createConversation(CONVERSATION_MESSAGE_CONTEXT.PROPOSED_REJECTED);

    // find the milestone owner and send a notification that his/her proposed milestone is rejected
    Mailer.proposedMilestoneRejected(app, {
      recipient: owner.email,
      user: owner.name,
      milestoneTitle: title,
      milestoneId: _id,
      campaignTitle: campaign.title,
      campaignId,
      message,
    });
  } else if (data.status === PROPOSED && prevStatus === REJECTED) {
    _createConversation(CONVERSATION_MESSAGE_CONTEXT.RE_PROPOSE);
  } else if (data.status === ARCHIVED && prevStatus === IN_PROGRESS) {
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

    // Create conversation

    let conversationModel;
    // Original event made the donation. For direct donations user makes donation in home network
    // but for delegate in foreign network
    let eventTxHash;

    const directDonation = Boolean(homeTxHash);

    // Direct donation
    if (directDonation) {
      eventTxHash = homeTxHash;
      conversationModel = {
        milestoneId: pledgeAdmin._id,
        messageContext: CONVERSATION_MESSAGE_CONTEXT.DONATED,
        donationId: donation._id,
        txHash: homeTxHash,
        payments: [
          {
            symbol: token.symbol,
            amount,
            decimals: token.decimals,
          },
        ],
        donorId: giverAddress,
        donorType: AdminTypes.GIVER,
      };
    }
    // Delegate
    else {
      eventTxHash = txHash;

      const [firstParentId] = parentDonations;
      const firstParent = await app.service('donations').get(firstParentId);
      let donorType;
      let donorId;
      if (firstParent.delegateTypeId) {
        donorType = AdminTypes.DAC;
        donorId = firstParent.delegateTypeId;
      } else {
        donorType = firstParent.ownerType;
        donorId = firstParent.ownerTypeId;
      }

      conversationModel = {
        milestoneId: pledgeAdmin._id,
        messageContext: CONVERSATION_MESSAGE_CONTEXT.DELEGATED,
        donationId: donation._id,
        txHash,
        payments: [
          {
            symbol: token.symbol,
            amount,
            decimals: token.decimals,
          },
        ],
        donorType,
        donorId,
      };
    }

    try {
      const { timestamp } = await getTransaction(app, eventTxHash, directDonation);
      conversationModel.createdAt = timestamp;
    } catch (e) {
      conversationModel.createdAt = new Date();
      logger.error(`Error on getting tx ${eventTxHash} info`, e);
    }

    await app
      .service('conversations')
      .create(conversationModel, { performedByAddress: actionTakerAddress });
  }
};

module.exports = {
  getPledgeAdmin,

  handleDonationConversationAndEmail,
  handleMilestoneConversationAndEmail,
};
