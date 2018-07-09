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

  const payments = paymentsFactory(app, queue);
  const admins = adminsFactory(app, liquidPledging, queue);
  const pledges = pledgesFactory(app, liquidPledging, queue);
  const cappedMilestones = cappedMilestonesFactory(app);

  return {
    /**
     * Dispatch the event to the appropriate handler
     *
     * @param {object} event Web3 event/log object
     */
    handle(event) {
      logger.info('handlingEvent: ', event);

      const handlers = {
        // lp admin events
        GiverAdded: admins.addGiver(event),
        GiverUpdated: admins.updateGiver(event),
        DelegateAdded: admins.addDelegate(event),
        DelegateUpdated: admins.updateDelegate(event),
        ProjectAdded: admins.addProject(event),
        ProjectUpdated: admins.updateProject(event),
        CancelProject: admins.cancelProject(event),
        SetApp: admins.setApp(event),

        // lp pledge events
        Transfer: pledges.transfer(event),

        // lp vault events
        AuthorizePayment: payments.authorizePayment(event),
        ConfirmPayment: payments.confirmPayment(event),
        CancelPayment: payments.cancelPayment(event),

        // lpp-capped-milestone events
        MilestoneCompleteRequested: cappedMilestones.reviewRequested(event),
        MilestoneCompleteRequestRejected: cappedMilestones.rejected(event),
        MilestoneCompleteRequestApproved: cappedMilestones.accepted(event),
        MilestoneChangeReviewerRequested: undefined,
        MilestoneReviewerChanged: undefined,
        MilestoneChangeRecipientRequested: undefined,
        MilestoneRecipientChanged: undefined,
        PaymentCollected: cappedMilestones.paymentCollected(event),
      };

      const handler = handlers[event.event];

      if (typeof handler !== 'function') {
        logger.error('Unknown event: ', event);
      }

      handler();
    },
  };
};

module.exports = eventHandler;
