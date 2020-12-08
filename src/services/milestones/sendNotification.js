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
  const {
    status,
    title,
    _id,
    campaignId,
    maxAmount,
    token,
    prevStatus,
    owner,
    txHash,
    message,
    ownerAddress,
    recipientAddress,
    mined,
    // donationCounters,
    campaign,
    reviewer,
    // recipient,
  } = result;

  if (context.method === 'create') {
    if (status === PROPOSED) {
      try {
        const { owner: campaignOwner } = await app.service('campaigns').get(data.campaignId);
        const { email, name } = campaignOwner;
        Notifications.milestoneProposed(app, {
          recipient: email,
          user: name,
          milestoneTitle: title,
          milestoneId: _id,
          campaignTitle: campaign.title,
          campaignId,
          amount: maxAmount,
          token,
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
      if (data.status === IN_PROGRESS && prevStatus === PROPOSED) {
        _createConversion('proposedAccepted');

        // find the milestone owner and send a notification that his/her proposed milestone is approved
        Notifications.proposedMilestoneAccepted(app, {
          recipient: owner.email,
          user: owner.name,
          milestoneTitle: title,
          milestoneId: _id,
          campaignTitle: campaign.title,
          campaignId,
          amount: maxAmount,
          txHash,
          message,
        });

        // milestone may have been created on the recipient's behalf
        // lets notify them if they are registered
        if (ownerAddress !== recipientAddress) {
          try {
            const { email, name } = await app.service('users').get(result.recipientAddress);
            Notifications.milestoneCreated(app, {
              recipient: email,
              user: name,
              milestoneTitle: data.title,
              milestoneId: _id,
              campaignId,
              amount: data.maxAmount,
              token: data.token,
            });
          } catch (e) {
            // ignore missing recipient
          }
        }
      } else if (status === PROPOSED && prevStatus === REJECTED) {
        try {
          const { owner: campaignOwner } = await app.service('campaigns').get(data.campaignId);
          const { email, name } = campaignOwner;

          Notifications.milestoneProposed(app, {
            recipient: email,
            user: name,
            milestoneTitle: title,
            milestoneId: _id,
            campaignTitle: campaign.title,
            campaignId,
            amount: maxAmount,
            token,
          });
        } catch (e) {
          logger.error('error sending proposed milestone notification', e);
        }
      } else if (
        status === IN_PROGRESS &&
        prevStatus === PROPOSED &&
        ownerAddress !== recipientAddress
      ) {
        // milestone may have been created on the recipient's behalf
        // lets notify them if they are registered
        try {
          const user = await app.service('users').get(recipientAddress);

          if (user) {
            Notifications.milestoneCreated(app, {
              recipient: user.email,
              user: user.name,
              milestoneTitle: data.title,
              milestoneId: _id,
              campaignId,
              amount: data.maxAmount,
              token: data.token,
            });
          }
        } catch (e) {
          // ignore missing user
        }
      } else if (data.status === NEEDS_REVIEW) {
        // find the milestone reviewer owner and send a notification that this milestone is been marked as complete and needs review
        _createConversion(status);

        Notifications.milestoneRequestReview(app, {
          recipient: reviewer.email,
          user: reviewer.name,
          milestoneTitle: title,
          milestoneId: _id,
          campaignTitle: campaign.title,
          campaignId,
          message,
        });
      } else if (status === COMPLETED && mined) {
        _createConversion(status);

        // find the milestone owner and send a notification that his/her milestone is marked complete
        Notifications.milestoneMarkedCompleted(app, {
          recipient: owner.email,
          user: owner.name,
          milestoneTitle: title,
          milestoneId: _id,
          campaignTitle: campaign.title,
          campaignId,
          message,
        });
      } else if (data.status === IN_PROGRESS && prevStatus === NEEDS_REVIEW) {
        _createConversion('rejected');

        // find the milestone reviewer and send a notification that his/her milestone has been rejected by reviewer
        // it's possible to have a null reviewer if that address has never logged in
        if (reviewer) {
          Notifications.milestoneReviewRejected(app, {
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
        _createConversion(status);

        // find the milestone owner and send a notification that his/her milestone is canceled
        Notifications.milestoneCanceled(app, {
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
      _createConversion('proposedRejected');

      // find the milestone owner and send a notification that his/her proposed milestone is rejected
      Notifications.proposedMilestoneRejected(app, {
        recipient: owner.email,
        user: owner.name,
        milestoneTitle: title,
        milestoneId: _id,
        campaignTitle: campaign.title,
        campaignId,
        message,
      });
    } else if (data.status === PROPOSED && prevStatus === REJECTED) {
      _createConversion('rePropose');
    } else if (data.status === ARCHIVED && prevStatus === IN_PROGRESS) {
      _createConversion('archived');
    }
  }
};

module.exports = sendNotification;
