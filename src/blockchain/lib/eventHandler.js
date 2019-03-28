const { LiquidPledging } = require('giveth-liquidpledging');
const logger = require('winston');
const paymentsFactory = require('../payments');
const adminsFactory = require('../admins');
const pledgesFactory = require('../pledges');
const milestonesFactory = require('../milestones');
const processingQueue = require('../../utils/processingQueue');

const eventHandler = app => {
  const web3 = app.getWeb3();

  const { liquidPledgingAddress } = app.get('blockchain');

  if (!liquidPledgingAddress) {
    throw new Error('liquidPledgingAddress is not defined in the configuration file');
  }

  const liquidPledging = new LiquidPledging(web3, liquidPledgingAddress);
  const queue = processingQueue('eventHandler');

  const payments = paymentsFactory(app);
  const admins = adminsFactory(app, liquidPledging);
  const pledges = pledgesFactory(app, liquidPledging);
  const milestones = milestonesFactory(app);

  return {
    /**
     * Dispatch the event to the appropriate handler
     *
     * @param {object} event Web3 event/log object
     */
    handle(event) {
      const handlers = {
        // lp admin events
        GiverAdded: admins.addGiver,
        GiverUpdated: admins.updateGiver,
        DelegateAdded: admins.addDelegate,
        DelegateUpdated: admins.updateDelegate,
        ProjectAdded: admins.addProject,
        ProjectUpdated: admins.updateProject,
        CancelProject: admins.cancelProject,
        SetApp: admins.setApp,

        // lp pledge events
        Transfer: pledges.transfer,

        // lp vault events
        AuthorizePayment: payments.authorizePayment,
        ConfirmPayment: undefined,
        CancelPayment: undefined,

        // lpp-capped-milestone events
        MilestoneCompleteRequested: milestones.reviewRequested,
        MilestoneCompleteRequestRejected: milestones.rejected,
        MilestoneCompleteRequestApproved: milestones.accepted,
        MilestoneChangeReviewerRequested: undefined,
        MilestoneReviewerChanged: milestones.reviewerChanged,
        MilestoneChangeRecipientRequested: undefined,
        MilestoneRecipientChanged: milestones.recipientChanged,

        // shared milestone events
        RequestReview: milestones.reviewRequested,
        RejectCompleted: milestones.rejected,
        ApproveCompleted: milestones.accepted,
        ReviewerChanged: milestones.reviewerChanged,
        RecipientChanged: milestones.recipientChanged,
        PaymentCollected: milestones.paymentCollected,
      };

      const handler = handlers[event.event];

      if (typeof handler !== 'function') {
        logger.error('Unknown event: ', event.event);
        return Promise.resolve();
      }

      return new Promise((resolve, reject) => {
        const fn = async () => {
          try {
            logger.info('Handling Event: ', event);
            await handler(event);
            resolve();
          } catch (err) {
            logger.error(err);
            reject(err);
          }
          queue.purge();
        };

        Object.defineProperty(fn, 'name', {
          value: `${event.event} - ${event.blockNumber} - ${event.id}`,
        });
        queue.add(fn);

        // start processing the queued events if we haven't already
        if (!queue.isProcessing()) queue.purge();
      });
    },
  };
};

module.exports = eventHandler;
