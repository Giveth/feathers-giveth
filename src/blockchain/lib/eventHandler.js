const { LiquidPledging } = require('giveth-liquidpledging');
const logger = require('winston');
const paymentsFactory = require('../payments');
const adminsFactory = require('../admins');
const pledgesFactory = require('../pledges');
const cappedMilestonesFactory = require('../cappedMilestones');
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
  const cappedMilestones = cappedMilestonesFactory(app);

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
        MilestoneCompleteRequested: cappedMilestones.reviewRequested,
        MilestoneCompleteRequestRejected: cappedMilestones.rejected,
        MilestoneCompleteRequestApproved: cappedMilestones.accepted,
        MilestoneChangeReviewerRequested: undefined,
        MilestoneReviewerChanged: undefined,
        MilestoneChangeRecipientRequested: undefined,
        MilestoneRecipientChanged: undefined,
        PaymentCollected: cappedMilestones.paymentCollected,
      };

      const handler = handlers[event.event];

      if (typeof handler !== 'function') {
        logger.error('Unknown event: ', event.event);
        return;
      }

      queue.add(async () => {
        try {
          logger.info('Handling Event: ', event);
          await handler(event);
        } catch (err) {
          logger.error(err);
        }
        queue.purge();
      });

      // start processing the queued events if we haven't already
      if (!queue.isProcessing()) queue.purge();
    },
  };
};

module.exports = eventHandler;
