const { LiquidPledging, LPVault, Kernel } = require('giveth-liquidpledging');
const { LPPCappedMilestone } = require('lpp-capped-milestone');
const semaphore = require('semaphore');
const { keccak256, padLeft, toHex } = require('web3-utils');
const logger = require('winston');

const processingQueue = require('../utils/processingQueue');
const to = require('../utils/to');
const { removeHexPrefix, getBlockTimestamp } = require('./lib/web3Helpers');
const { EventStatus } = require('../models/events.model');

/**
 * get the last block that we have gotten logs from
 *
 * @param {object} app feathers app instance
 */
const getLastBlock = async app => {
  const opts = {
    paginate: false,
    query: {
      $limit: 1,
      $sort: {
        blockNumber: -1,
      },
    },
  };

  const [err, events] = await to(app.service('events').find(opts));

  if (err) logger.error('Error fetching events');

  if (events && events.length > 0) return events[0].blockNumber;

  // default to blockchain.startingBlock in config
  const { startingBlock } = app.get('blockchain');
  return startingBlock || 0;
};

/**
 * fetch any events that have a status `Waiting`
 * @param {object} eventsService feathersjs `events` service
 * @returns {array} events sorted by transactionHash & logIndex
 */
async function getWaitingEvents(eventsService) {
  // all unconfirmed events sorted by txHash & logIndex
  const query = {
    status: EventStatus.WAITING,
    $sort: { blockNumber: 1, transactionIndex: 1, transactionHash: 1, logIndex: 1 },
  };
  return eventsService.find({ paginate: false, query });
}

/**
 * fetch any events that have a status `Waiting` of `Processing
 * @param {object} eventsService feathersjs `events` service
 * @returns {array} events sorted by transactionHash & logIndex
 */
async function getUnProcessedEvents(eventsService) {
  // all unprocessed events sorted by txHash & logIndex
  const query = {
    status: { $in: [EventStatus.WAITING, EventStatus.PROCESSING] },
    $sort: { blockNumber: 1, transactionIndex: 1, transactionHash: 1, logIndex: 1 },
  };
  return eventsService.find({ paginate: false, query });
}

/**
 *
 * @param {object} web3 Web3 instance
 * @param {array} topics topics to subscribe to
 */
function subscribeLogs(web3, topics) {
  // subscribe to events for the given topics
  return web3.eth
    .subscribe('logs', { topics }, () => {}) // TODO fix web3 bug so we don't have to pass a cb
    .on('error', err => logger.error('SUBSCRIPTION ERROR: ', err));
}

/**
 * factory function for generating an event watcher
 *
 * @param {object} app feathersjs app instance
 * @param {object} eventHandler eventHandler instance
 */
const watcher = (app, eventHandler) => {
  const web3 = app.getWeb3();
  const requiredConfirmations = app.get('blockchain').requiredConfirmations || 0;
  const queue = processingQueue('NewEventQueue');
  const eventService = app.service('events');
  const sem = semaphore();

  const { vaultAddress } = app.get('blockchain');
  const lpVault = new LPVault(web3, vaultAddress);
  let kernel;

  let initialized = false;
  let fetchedPastEvents = false;
  let lastBlock = 0;

  function setLastBlock(blockNumber) {
    if (blockNumber > lastBlock) lastBlock = blockNumber;
  }

  /**
   * Here we save the event so that they can be processed
   * later after waiting for x number of confirmations (defined in config).
   *
   * @param {object} event the web3 log to process
   * @param {boolean} isReprocess are we reprocessing the event?
   */
  async function processNewEvent(event, isReprocess = false) {
    const { logIndex, transactionHash } = event;

    logger.info('processNewEvent called', event.id);
    const data = await eventService.find({ paginate: false, query: { logIndex, transactionHash } });

    if (!isReprocess && data.some(e => e.status !== EventStatus.WAITING)) {
      logger.error(
        'RE-ORG ERROR: attempting to process newEvent, however the matching event has already started processing. Consider increasing the requiredConfirmations.',
        event,
        data,
      );
    } else if (!isReprocess && data.length > 0) {
      logger.error(
        'attempting to process new event but found existing event with matching logIndex and transactionHash.',
        event,
        data,
      );
    }

    if (isReprocess && data.length > 0) {
      const e = data[0];
      if ([EventStatus.WAITING, EventStatus.PROCESSING].includes(e.status)) {
        // ignore this reprocess b/c we still need to process an existing event
        logger.info(
          `Ignoring reprocess event for event._id: ${
            e._id
          }. Existing event has not finished processing`,
        );
      } else {
        await eventService.patch(
          e._id,
          Object.assign({}, e, event, { confirmations: 0, status: EventStatus.WAITING }),
        );
      }
    } else {
      await eventService.create(Object.assign({}, event, { confirmations: 0 }));
    }
    queue.purge();
  }

  async function getUnconfirmedEventsByConfirmations(currentBlock) {
    const unconfirmedEvents = await getWaitingEvents(eventService);

    // sort the events into buckets by # of confirmations
    return unconfirmedEvents.reduce((val, event) => {
      const diff = currentBlock - event.blockNumber;
      const c = diff >= requiredConfirmations ? requiredConfirmations : diff;

      if (requiredConfirmations === 0 || c > 0) {
        // eslint-disable-next-line no-param-reassign
        if (!val[c]) val[c] = [];
        val[c].push(event);
      }
      return val;
    }, []);
  }

  /**
   * Handle new events as they are emitted, and add them to a queue for sequential
   * processing of events with the same id.
   */
  function newEvent(event, isReprocess = false) {
    if (!isReprocess) setLastBlock(event.blockNumber);

    logger.info('newEvent called', event);
    // during a reorg, the same event can occur in quick succession, so we add everything to a
    // queue so they are processed synchronously
    queue.add(() => processNewEvent(event, isReprocess));

    // start processing the queued events if we haven't already
    if (!queue.isProcessing()) queue.purge();
  }

  /**
   * Here we remove the event
   *
   * @param {object} event the web3 log to process
   */
  async function processRemoveEvent(event) {
    const { id, transactionHash } = event;

    logger.info('processRemoveEvent called', id);
    await eventService.remove(null, {
      query: { id, transactionHash, status: EventStatus.WAITING },
    });

    const data = await eventService.find({
      paginate: false,
      query: { id, transactionHash, status: { $ne: EventStatus.WAITING } },
    });
    if (data.length > 0) {
      logger.error(
        'RE-ORG ERROR: removeEvent was called, however the matching event is already processing/processed so we did not remove it. Consider increasing the requiredConfirmations.',
        event,
        data,
      );
    }
    logger.info('processRemoveEvent finished', id);
    queue.purge();
  }

  /**
   * remove this event if it has yet to start processing
   */
  function removeEvent(event) {
    logger.info('removeEvent called', event);
    // during a reorg, the same event can occur in quick succession, so we add everything to a
    // queue so they are processed synchronously
    queue.add(() => processRemoveEvent(event));

    // start processing the queued events if we haven't already
    if (!queue.isProcessing()) queue.purge();
  }

  /**
   * submit events to the eventsHandler for processing.
   *
   * Updates the status of the event depending on the processing result
   *
   * @param {array} events
   */
  async function processEvents(events) {
    await eventService.patch(
      null,
      { status: EventStatus.PROCESSING, confirmations: requiredConfirmations },
      { query: { _id: { $in: events.map(e => e._id) } } },
    );

    // now that the event is confirmed, handle the event
    events.forEach(event => {
      eventHandler
        .handle(event)
        .then(() => eventService.patch(event._id, { status: EventStatus.PROCESSED }))
        .catch(error =>
          eventService.patch(event._id, {
            status: EventStatus.FAILED,
            processingError: error.toString(),
          }),
        );
    });
  }
  /**
   * Finds all un-confirmed events, updates the # of confirmations and initiates
   * processing of the event if the requiredConfirmations has been reached
   */
  async function updateEventConfirmations(currentBlock) {
    sem.take(async () => {
      try {
        const [err, eventsByConfirmations] = await to(
          getUnconfirmedEventsByConfirmations(currentBlock),
        );

        if (err) {
          logger.error('Error fetching un-confirmed events', err);
          sem.leave();
          return;
        }

        // updated the # of confirmations for the events and process the event if confirmed
        await Promise.all(
          eventsByConfirmations.map(async (e, confirmations) => {
            if (confirmations === requiredConfirmations) {
              await processEvents(e);
            } else {
              await eventService.patch(
                null,
                { confirmations },
                { query: { blockNumber: currentBlock - requiredConfirmations + confirmations } },
              );
            }
          }),
        );
      } catch (err) {
        logger.error('error calling updateConfirmations', err);
      }
      sem.leave();
    });
  }

  // subscriptions

  const subscriptions = [];

  // get notified of new blocks
  function subscribeBlockHeaders() {
    subscriptions.push(
      web3.eth
        .subscribe('newBlockHeaders')
        .on('data', block => {
          if (!block.number || !fetchedPastEvents) return;
          updateEventConfirmations(block.number);
        })
        .on('changed', e => e.removed && removeEvent(e))
        .on('error', err => logger.error('SUBSCRIPTION ERROR: ', err)),
    );
  }

  const { liquidPledgingAddress } = app.get('blockchain');
  const liquidPledging = new LiquidPledging(web3, liquidPledgingAddress);
  const lppCappedMilestone = new LPPCappedMilestone(web3).$contract;
  const lppCappedMilestoneEventDecoder = lppCappedMilestone._decodeEventABI.bind({
    name: 'ALLEVENTS',
    jsonInterface: lppCappedMilestone._jsonInterface,
  });

  function getLppCappedMilestoneTopics() {
    return [
      [
        keccak256('MilestoneCompleteRequested(address,uint64)'),
        keccak256('MilestoneCompleteRequestRejected(address,uint64)'),
        keccak256('MilestoneCompleteRequestApproved(address,uint64)'),
        keccak256('MilestoneChangeReviewerRequested(address,uint64,address)'),
        keccak256('MilestoneReviewerChanged(address,uint64,address)'),
        keccak256('MilestoneChangeRecipientRequested(address,uint64,address)'),
        keccak256('MilestoneRecipientChanged(address,uint64,address)'),
        keccak256('PaymentCollected(address,uint64)'),
      ],
      padLeft(`0x${removeHexPrefix(liquidPledging.$address).toLowerCase()}`, 64),
    ];
  }

  /**
   * Ensures that no donations occur after the last event.
   *
   * If we reprocess events w/o clearing the donations, this will cause
   * issues with how we calculate which donation to transfer, etc.
   */
  async function checkDonations() {
    const lastEvent = await eventService.find({
      paginate: false,
      query: { $limit: 1, $sort: { createdAt: -1 } },
    });

    const lastDonation = await app.service('donations').find({
      paginate: false,
      query: { $limit: 1, $sort: { createdAt: -1 } },
    });

    console.log(lastDonation);
    if (lastDonation.length > 0) {
      const lastEventTs =
        lastEvent.length > 0 ? await getBlockTimestamp(web3, lastEvent[0].blockNumber) : 0;
      console.log(lastEventTs);
      if (lastDonation[0].createdAt > lastEventTs) {
        logger.error(
          `It appears that you are attempting to reprocess events, or the events table has 
          been altered and there are donations. In order to correctly sync/re-sync, the 
          'donations' and 'events' tables must both be cleared, otherwise the donations
          will not be an accurate representation of the blockchain txs`,
        );
        process.exit(1);
      }
    }
  }

  /**
   * Fetch all past events we are interested in
   */
  async function fetchPastEvents() {
    const fromBlock = toHex(lastBlock + 1) || toHex(1); // convert to hex due to web3 bug https://github.com/ethereum/web3.js/issues/1097

    await liquidPledging.$contract
      .getPastEvents({ fromBlock })
      .then(events => events.forEach(newEvent));

    await kernel.$contract
      .getPastEvents({
        fromBlock,
        filter: {
          namespace: keccak256('base'),
          name: [keccak256('lpp-capped-milestone'), keccak256('lpp-campaign')],
        },
      })
      .then(events => events.forEach(newEvent));

    await web3.eth
      .getPastLogs({
        fromBlock,
        topics: getLppCappedMilestoneTopics(),
      })
      .then(events => events.forEach(e => newEvent(lppCappedMilestoneEventDecoder(e))));

    await lpVault.$contract.getPastEvents({ fromBlock }).then(events => events.forEach(newEvent));

    // set a timeout here to give a chance for all fetched events to be added via newEvent
    setTimeout(() => {
      fetchedPastEvents = true;
    }, 1000 * 30);
  }
  /**
   * subscribe to LP events
   */
  function subscribeLP() {
    subscriptions.push(
      liquidPledging.$contract.events
        .allEvents({})
        .on('data', newEvent)
        .on('changed', e => e.removed && removeEvent(e))
        .on('error', err => logger.error('SUBSCRIPTION ERROR: ', err)),
    );
  }

  /**
   * subscribe to SetApp events for lpp-capped-milestone & lpp-campaign
   */
  async function subscribeApps() {
    subscriptions.push(
      kernel.$contract.events
        .SetApp({
          filter: {
            namespace: keccak256('base'),
            name: [keccak256('lpp-capped-milestone'), keccak256('lpp-campaign')],
          },
        })
        .on('data', newEvent)
        .on('changed', e => e.removed && removeEvent(e))
        .on('error', err => logger.error('SUBSCRIPTION ERROR: ', err)),
    );
  }

  /**
   * subscribe to lpp-capped-milestone events associated with the this lp contract
   */
  function subscribeCappedMilestones() {
    subscriptions.push(
      subscribeLogs(web3, getLppCappedMilestoneTopics())
        .on('data', e => newEvent(lppCappedMilestoneEventDecoder(e)))
        .on('changed', e => e.removed && removeEvent(e)),
    );
  }

  /**
   * subscribe to the lp vault events
   */
  function subscribeVault() {
    // starts a listener on the vault contract
    subscriptions.push(
      lpVault.$contract.events
        .allEvents({})
        .on('data', newEvent)
        .on('changed', e => e.removed && removeEvent(e))
        .on('error', err => logger.error('SUBSCRIPTION ERROR: ', err)),
    );
  }

  // exposed api

  return {
    /**
     * subscribe to all events that we are interested in
     */
    async start() {
      if (!initialized) {
        setLastBlock(await getLastBlock(app));

        const kernelAddress = await liquidPledging.kernel();
        kernel = new Kernel(web3, kernelAddress);

        await checkDonations();
        fetchPastEvents();
        // start processing any events that have not been processed
        processEvents(await getUnProcessedEvents(eventService));
        initialized = true;
      }

      if (subscriptions.length) this.close();

      subscribeBlockHeaders();
      subscribeLP();
      subscribeApps();
      subscribeCappedMilestones();
      subscribeVault();
    },

    /**
     * Add event for processing if it hasn't already been processed
     *
     * @param {object} event web3 event object
     */
    addEvent(event) {
      newEvent(event, true);
    },

    /**
     * unsubscribe from all events
     */
    close() {
      subscriptions.forEach(s => s.unsubscribe());
      // clear subscriptions array
      subscriptions.splice(0, subscriptions.length);
    },
  };
};

module.exports = watcher;
