const logger = require('winston');

const { MilestoneStatus } = require('../../models/milestones.model');
const Notifications = require('./../../utils/dappMailer');

/**
 *
 * Conditionally sends a notification after patch or create
 *
 * */
const sendNotification = () => async context => {
  const { data, app, result, params } = context;
  const { performedByAddress } = params;

  const _createConversion = messageContext => {
    app
      .service('conversations')
      .create(
        {
          milestoneId: result._id,
          message: result.message,
          items: result.proofItems,
          messageContext,
          txHash: context.params.eventTxHash,
        },
        { performedByAddress },
      )
      .then(res => logger.info('created conversation!', res._id))
      .catch(e => logger.error('could not create conversation', e));
  };

  /**
   * Notifications when a milestone get created
   * */
  if (context.method === 'create') {
    if (result.status === MilestoneStatus.PROPOSED) {
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
   * Notifications when a milestone get patches
   * This only gets triggered when the txHash is received through a milestone event
   * Which basically means the event is really mined
   * */
  if (context.method === 'patch' && context.params.eventTxHash) {
    if (
      result.prevStatus === MilestoneStatus.PROPOSED &&
      result.status === MilestoneStatus.IN_PROGRESS
    ) {
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
    }

    if (
      result.status === MilestoneStatus.IN_PROGRESS &&
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
    }

    if (result.status === MilestoneStatus.NEEDS_REVIEW) {
      // find the milestone reviewer owner and send a notification that this milestone is been marked as complete and needs review
      _createConversion(result.status);

      Notifications.milestoneRequestReview(app, {
        recipient: result.reviewer.email,
        user: result.reviewer.name,
        milestoneTitle: result.title,
        campaignTitle: result.campaign.title,
        message: result.message,
      });
    }

    if (result.status === MilestoneStatus.COMPLETED && result.mined) {
      _createConversion(result.status);

      // find the milestone owner and send a notification that his/her milestone is marked complete
      Notifications.milestoneMarkedCompleted(app, {
        recipient: result.owner.email,
        user: result.owner.name,
        milestoneTitle: result.title,
        campaignTitle: result.campaign.title,
        message: result.message,
      });
    }

    if (
      result.prevStatus === MilestoneStatus.NEEDS_REVIEW &&
      result.status === MilestoneStatus.IN_PROGRESS
    ) {
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
    }

    if (result.status === MilestoneStatus.CANCELED && result.mined) {
      _createConversion(result.status);

      // find the milestone owner and send a notification that his/her milestone is canceled
      Notifications.milestoneCanceled(app, {
        recipient: result.owner.email,
        user: result.owner.name,
        milestoneTitle: result.title,
        campaignTitle: result.campaign.title,
        message: result.message,
      });
    }

    if (
      result.status === MilestoneStatus.PAID &&
      result.mined &&
      result.prevStatus === MilestoneStatus.PAYING
    ) {
      Notifications.milestonePaid(app, {
        recipient: result.recipient.email,
        user: result.recipient.name,
        milestoneTitle: result.title,
        donationCounters: result.donationCounters,
        address: result.recipientAddress,
      });
    }
  }

  if (context.method === 'patch' && !context.params.eventTxHash) {
    if (
      result.prevStatus === MilestoneStatus.PROPOSED &&
      result.status === MilestoneStatus.REJECTED
    ) {
      _createConversion('proposedRejected');

      // find the milestone owner and send a notification that his/her proposed milestone is rejected
      Notifications.proposedMilestoneRejected(app, {
        recipient: result.owner.email,
        user: result.owner.name,
        milestoneTitle: result.title,
        campaignTitle: result.campaign.title,
        message: result.message,
      });
    }

    if (
      result.prevStatus === MilestoneStatus.REJECTED &&
      result.status === MilestoneStatus.PROPOSED
    ) {
      _createConversion('rePropose');
    }
  }
};

module.exports = sendNotification;
