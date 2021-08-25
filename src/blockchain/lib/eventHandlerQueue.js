const { LiquidPledging } = require('@giveth/liquidpledging-contract');
const logger = require('winston');
const config = require('config');
const Queue = require('bull');
const paymentsFactory = require('../payments');
const adminsFactory = require('../admins');
const pledgesFactory = require('../pledges');
const milestonesFactory = require('../traces');
const { EventStatus } = require('../../models/events.model');

const handleEventQueue = new Queue('eventHandler', { redis: config.get('redis') });
const pendingEventQueue = new Queue('NewEventQueue', { redis: config.get('redis') });
const TWO_MINUTES = 1000 * 60 * 2;

setInterval(async () => {
  const eventHandlerQueueCount = await handleEventQueue.count();
  const NewEventQueueCount = await pendingEventQueue.count();
  logger.info(`Job queues count:`, {
    eventHandlerQueueCount,
    NewEventQueueCount,
  });
}, TWO_MINUTES);

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

function similarEventNotFoundOrAllEventsAreFailed(data) {
  // check there are no similar events or if there are some, all of them should have Failed status
  return data.length === 0 || !data.find(e => e.status !== EventStatus.FAILED);
}

const addPendingEvent = async (app, event) => {
  const eventService = app.service('events');
  const { logIndex, transactionHash } = event;
  const data = await eventService.find({
    paginate: false,
    query: { logIndex, transactionHash },
  });
  if (
    data.some(e =>
      [
        EventStatus.WAITING,
        EventStatus.PROCESSING,
        EventStatus.PENDING,
        EventStatus.PROCESSED,
      ].includes(e.status),
    )
  ) {
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
  } else if (similarEventNotFoundOrAllEventsAreFailed(data)) {
    await eventService.create({
      ...event,
      confirmations: 0,
      status: EventStatus.PENDING,
      isHomeEvent: false, // Just events of foreign network can be fetched in pending state (not have enough confirmation)
    });
  }
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
    const callDoneTimeout = setTimeout(() => {
      logger.error('The event handler didnt respond, call done() to prevent stocking queue');
      done();
    }, TWO_MINUTES);

    try {
      const remainingEventsInQueue = await handleEventQueue.count();
      const handler = handlers[event.event];

      logger.info('Handling Event: ', {
        remainingEventsInQueue,
        event: event.event,
        transactionHash: event.transactionHash,
        status: event.status,
        transactionIndex: event.transactionIndex,
        logIndex: event.logIndex,
        _id: event._id,
      });
      const eventInDb = await eventService.get(event._id);
      if (eventInDb === EventStatus.PROCESSED) {
        logger.info('Event is already processed, so dont need to handle again', {
          event: event.event,
          _id: event._id,
          transactionHash: event.transactionHash,
          transactionIndex: event.transactionIndex,
        });
        clearTimeout(callDoneTimeout);
        done();
        return;
      }
      if (typeof handler === 'function') {
        await handler(event);
      } else {
        logger.error('Unknown event: ', event.event);
      }
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
      clearTimeout(callDoneTimeout);
      done();
    }
  });
};

const addEventToQueue = async (app, { event }) => {
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
  return pendingEventQueue.add({
    event,
    remove,
  });
};

module.exports = {
  addEventToQueue,
  addCreateOrRemoveEventToQueue,
  initNewEventQueue,
  initEventHandlerQueue,
};
