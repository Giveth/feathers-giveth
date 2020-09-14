const logger = require('winston');

const { MilestoneStatus } = require('../../models/milestones.model');
const Notifications = require('../../utils/dappMailer');

/**
 *
 * Conditionally sends a notification after patch or create
 *
 * */
const sendNotification = () => async context => {
  const { data, app, result, params } = context;
  const { performedByAddress, eventTxHash } = params;

  const _createConversion = async messageContext => {
    const service = app.service('conversations');
    const { proofItems, _id, message } = result;

    // Comment doesn't have hash value and other fields should not be uniq
    if (messageContext !== 'comment') {
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

    try {
      const res = await service.create(
        {
          milestoneId: _id,
          message,
          items: proofItems,
          messageContext,
          txHash: eventTxHash,
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
    PAYING,
    PAID,
    NEEDS_REVIEW,
    IN_PROGRESS,
    PROPOSED,
    ARCHIVED,
  } = MilestoneStatus;
  if (context.method === 'create') {
    if (result.status === PROPOSED) {
      try {
        const campaign = await app.service('campaigns').get(data.campaignId);

        Notifications.milestoneProposed(app, {
          recipient: campaign.owner.email,
          user: campaign.owner.name,
          milestoneTitle: data.title,
          campaignTitle: campaign.title,
          amount: data.maxAmount,
          token: data.token,
        });
      } catch (e) {
        logger.error('error sending proposed milestone notification', e);
      }
    }
  }

  /**
   * Generate Notifications and Conversations when a milestone is patched
   */
  if (context.method === 'patch' && data.status) {
    /**
     * This only gets triggered when the txHash is received through a milestone event
     * Which basically means the event is really mined
     * */
    if (eventTxHash) {
      if (data.status === IN_PROGRESS && result.prevStatus === PROPOSED) {
        _createConversion('proposedAccepted');

        // find the milestone owner and send a notification that his/her proposed milestone is approved
        Notifications.proposedMilestoneAccepted(app, {
          recipient: result.owner.email,
          user: result.owner.name,
          milestoneTitle: result.title,
          campaignTitle: result.campaign.title,
          amount: result.maxAmount,
          txHash: result.txHash,
          message: result.message,
        });

        // milestone may have been created on the recipient's behalf
        // lets notify them if they are registered
        if (result.ownerAddress !== result.recipientAddress) {
          try {
            const recipient = await app.service('users').get(result.recipientAddress);

            Notifications.milestoneCreated(app, {
              recipient: recipient.email,
              user: recipient.name,
              milestoneTitle: data.title,
              amount: data.maxAmount,
              token: data.token,
            });
          } catch (e) {
            // ignore missing recipient
          }
        }
      } else if (data.status === PROPOSED && result.prevStatus === REJECTED) {
        try {
          const campaign = await app.service('campaigns').get(data.campaignId);

          Notifications.milestoneProposed(app, {
            recipient: campaign.owner.email,
            user: campaign.owner.name,
            milestoneTitle: data.title,
            campaignTitle: campaign.title,
            amount: data.maxAmount,
            token: data.token,
          });
        } catch (e) {
          logger.error('error sending proposed milestone notification', e);
        }
      } else if (
        data.status === IN_PROGRESS &&
        result.prevStatus === PROPOSED &&
        result.ownerAddress !== result.recipientAddress
      ) {
        // milestone may have been created on the recipient's behalf
        // lets notify them if they are registered
        try {
          const user = await app.service('users').get(result.recipientAddress);

          if (user) {
            Notifications.milestoneCreated(app, {
              recipient: user.email,
              user: user.name,
              milestoneTitle: data.title,
              amount: data.maxAmount,
              token: data.token,
            });
          }
        } catch (e) {
          // ignore missing user
        }
      } else if (data.status === NEEDS_REVIEW) {
        // find the milestone reviewer owner and send a notification that this milestone is been marked as complete and needs review
        _createConversion(result.status);

        Notifications.milestoneRequestReview(app, {
          recipient: result.reviewer.email,
          user: result.reviewer.name,
          milestoneTitle: result.title,
          campaignTitle: result.campaign.title,
          message: result.message,
        });
      } else if (data.status === COMPLETED && result.mined) {
        _createConversion(result.status);

        // find the milestone owner and send a notification that his/her milestone is marked complete
        Notifications.milestoneMarkedCompleted(app, {
          recipient: result.owner.email,
          user: result.owner.name,
          milestoneTitle: result.title,
          campaignTitle: result.campaign.title,
          message: result.message,
        });
      } else if (data.status === IN_PROGRESS && result.prevStatus === NEEDS_REVIEW) {
        _createConversion('rejected');

        // find the milestone reviewer and send a notification that his/her milestone has been rejected by reviewer
        // it's possible to have a null reviewer if that address has never logged in
        if (result.reviewer) {
          Notifications.milestoneReviewRejected(app, {
            recipient: result.reviewer.email,
            user: result.reviewer.name,
            milestoneTitle: result.title,
            campaignTitle: result.campaign.title,
            message: result.message,
          });
        }
      } else if (data.status === CANCELED && result.mined) {
        _createConversion(result.status);

        // find the milestone owner and send a notification that his/her milestone is canceled
        Notifications.milestoneCanceled(app, {
          recipient: result.owner.email,
          user: result.owner.name,
          milestoneTitle: result.title,
          campaignTitle: result.campaign.title,
          message: result.message,
        });
      } else if (data.status === PAID && result.mined && result.prevStatus === PAYING) {
        Notifications.milestonePaid(app, {
          recipient: result.recipient.email,
          user: result.recipient.name,
          milestoneTitle: result.title,
          donationCounters: result.donationCounters,
          address: result.recipientAddress,
        });
      }
    } else if (data.status === REJECTED && result.prevStatus === PROPOSED) {
      _createConversion('proposedRejected');

      // find the milestone owner and send a notification that his/her proposed milestone is rejected
      Notifications.proposedMilestoneRejected(app, {
        recipient: result.owner.email,
        user: result.owner.name,
        milestoneTitle: result.title,
        campaignTitle: result.campaign.title,
        message: result.message,
      });
    } else if (data.status === PROPOSED && result.prevStatus === REJECTED) {
      _createConversion('rePropose');
    } else if (data.status === ARCHIVED && result.prevStatus === IN_PROGRESS) {
      _createConversion('archived');
    }
  }
};

module.exports = sendNotification;
