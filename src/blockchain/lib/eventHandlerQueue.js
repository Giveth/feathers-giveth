const { LiquidPledging } = require('giveth-liquidpledging');
const logger = require('winston');
const config = require('config');
const Queue = require('bull');
const paymentsFactory = require('../payments');
const adminsFactory = require('../admins');
const pledgesFactory = require('../pledges');
const milestonesFactory = require('../milestones');
const { EventStatus } = require('../../models/events.model');

const handleEventQueue = new Queue('eventHandler', { redis: config.get('redis') });
const pendingEventQueue = new Queue('NewEventQueue', { redis: config.get('redis') });

setInterval(async () => {
  const eventHandlerQueueCount = await handleEventQueue.count();
  const NewEventQueueCount = await handleEventQueue.count();
  logger.info(`Job queues count:`, {
    eventHandlerQueueCount,
    NewEventQueueCount,
  });
}, 1000 * 60 * 2);

let isEventHandlerQueueInitialized = false;
let isNewEventQueueInitialized = false;

const removeEvent = async (app, event) => {
  const { id, transactionHash } = event;
  const eventService = app.service('events');

  await eventService.remove(null, {
    query: { id, transactionHash, status: { $in: [EventStatus.PENDING, EventStatus.WAITING] } },
  });

  const data = await eventService.find({
    paginate: false,
    query: { id, transactionHash, status: { $nin: [EventStatus.PENDING, EventStatus.WAITING] } },
  });
  if (data.length > 0) {
    logger.error(
      'RE-ORG ERROR: removeEvent was called, however the matching event is already processing/processed so we did not remove it. Consider increasing the requiredConfirmations.',
      event,
      data,
    );
  }
};
const addPendingEvent = async (app, event) => {
  const eventService = app.service('events');
  const { logIndex, transactionHash } = event;
  const data = await eventService.find({
    paginate: false,
    query: { logIndex, transactionHash },
  });

  if (data.some(e => [EventStatus.WAITING, EventStatus.PENDING].includes(e.status))) {
    logger.error(
      'RE-ORG ERROR: attempting to process newEvent, however the matching event has already started processing. Consider increasing the requiredConfirmations.',
      event,
      data,
    );
  } else if (data.length > 0) {
    logger.error(
      'attempting to process new event but found existing event with matching logIndex and transactionHash.',
      event,
      data,
    );
  }
  await eventService.create({
    ...event,
    confirmations: 0,
    status: EventStatus.PENDING,
    isHomeEvent: false, // Just events of foreign network can be fetched in pending state (not have enough confirmation)
  });
};

const initNewEventQueue = app => {
  pendingEventQueue.process(1, async (job, done) => {
    const { event, remove } = job.data;
    try {
      if (remove) {
        await removeEvent(app, event);
      } else {
        await addPendingEvent(app, event);
      }
    } catch (e) {
      logger.error('handle initNewEventQueue error', e);
    } finally {
      done();
    }
  });
  isNewEventQueueInitialized = true;
};
const initEventHandlerQueue = app => {
  const web3 = app.getWeb3();
  const { liquidPledgingAddress } = app.get('blockchain');
  if (!liquidPledgingAddress) {
    throw new Error('liquidPledgingAddress is not defined in the configuration file');
  }
  const liquidPledging = new LiquidPledging(web3, liquidPledgingAddress);
  const payments = paymentsFactory(app);
  const admins = adminsFactory(app, liquidPledging);
  const pledges = pledgesFactory(app, liquidPledging);
  const milestones = milestonesFactory(app);
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

    // giveth bridge events
    PaymentAuthorized: payments.paymentAuthorized,
    PaymentExecuted: payments.paymentExecuted,

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
  const eventService = app.service('events');

  handleEventQueue.process(1, async (job, done) => {
    const { event } = job.data;
    try {
      const handler = handlers[event.event];
      logger.info('Handling Event: ', {
        event: event.event,
        transactionHash: event.transactionHash,
        status: event.status,
        transactionIndex: event.transactionIndex,
        logIndex: event.logIndex,
        _id: event._id,
      });
      if (typeof handler !== 'function') {
        logger.error('Unknown event: ', event.event);
        return;
      }
      await handler(event);
      await eventService.patch(event._id, { status: EventStatus.PROCESSED });
    } catch (e) {
      logger.error('processing event failed ', {
        event,
        errorMessage: e.message,
      });
      eventService.patch(event._id, {
        status: EventStatus.FAILED,
        processingError: e.toString(),
      });
    } finally {
      done();
    }
  });
  isEventHandlerQueueInitialized = true;
};

const addEventToQueue = async (app, { event }) => {
  if (!isEventHandlerQueueInitialized) {
    initEventHandlerQueue(app);
  }
  const requiredConfirmations = app.get('blockchain').requiredConfirmations || 0;
  await app.service('events').patch(event._id, {
    status: EventStatus.PROCESSING,
    confirmations: requiredConfirmations,
  });
  return handleEventQueue.add({
    event,
  });
};
const addCreateOrRemoveEventToQueue = (app, { event, remove = false }) => {
  if (!isNewEventQueueInitialized) {
    initNewEventQueue(app);
  }
  return pendingEventQueue.add({
    event,
    remove,
  });
};

module.exports = { addEventToQueue, addCreateOrRemoveEventToQueue };
