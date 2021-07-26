const { LiquidPledging, LPVault, Kernel } = require('giveth-liquidpledging');
const { LPPCappedMilestone } = require('lpp-capped-milestone');
const { BridgedMilestone, LPMilestone } = require('lpp-milestones');
const { GivethBridge } = require('giveth-bridge');
const semaphore = require('semaphore');
const { keccak256, padLeft, toHex } = require('web3-utils');
const logger = require('winston');
const Sentry = require('@sentry/node');
const to = require('../utils/to');
const { removeHexPrefix } = require('./lib/web3Helpers');
const { EventStatus } = require('../models/events.model');
const { DonationStatus } = require('../models/donations.model');
const {
  addEventToQueue,
  addCreateOrRemoveEventToQueue,
  initNewEventQueue,
  initEventHandlerQueue,
} = require('./lib/eventHandlerQueue');

/**
 * get the last block that we have gotten logs from
 *
 * @param {object} app feathers app instance
 * @param {boolean} isHome network is home flag
 */
const getLastBlock = async (app, isHome = false) => {
  const opts = {
    paginate: false,
    query: {
      status: { $ne: EventStatus.PENDING },
      isHomeEvent: isHome,
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
  const { startingBlock, startingHomeBlock } = app.get('blockchain');
  return (isHome ? startingHomeBlock : startingBlock) || 0;
};

/**
 * fetch any events that have a status `PENDING`
 *
 * @param {object} eventsService feathersjs `events` service
 * @returns {array} events sorted by transactionHash & logIndex
 */
async function getPendingEvents(eventsService) {
  // all pending events sorted by txHash & logIndex
  const query = {
    status: EventStatus.PENDING,
    $sort: { isHomeEvent: 1, blockNumber: 1, transactionIndex: 1, logIndex: 1 },
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
 */
const watcher = app => {
  const web3 = app.getWeb3();
  const homeWeb3 = app.getHomeWeb3();
  const requiredConfirmations = app.get('blockchain').requiredConfirmations || 0;
  const eventService = app.service('events');
  const sem = semaphore();

  const { vaultAddress } = app.get('blockchain');
  const lpVault = new LPVault(web3, vaultAddress);
  let kernel;

  let isFetchingPastForeignEvents = false; // To indicate if the fetching process of past events is in progress or not.
  let isFetchingPastHomeEvents = false; // To indicate if the fetching process of past events is in progress or not.
  let lastForeignBlock = 0;
  let lastHomeBlock = 0;

  function setLastForeignBlock(blockNumber) {
    if (blockNumber > lastForeignBlock) lastForeignBlock = blockNumber;
  }
  function setLastHomeBlock(blockNumber) {
    if (blockNumber > lastHomeBlock) lastHomeBlock = blockNumber;
  }

  async function getPendingEventsByConfirmations(currentBlock) {
    const pendingEvents = await getPendingEvents(eventService);

    // sort the events into buckets by # of confirmations
    return pendingEvents.reduce((val, event) => {
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
   * Add new events to queue to be process sequentially
   */
  function newPendingEvent(event) {
    logger.info(
      `newPendingEvent called. Block: ${event.blockNumber} log: ${event.logIndex} transactionHash: ${event.transactionHash}`,
    );
    addCreateOrRemoveEventToQueue(app, {
      event,
    });
  }

  /**
   * remove this event if it has yet to start processing
   */
  function removeEvent(event) {
    logger.info(
      `removeEvent called. Block: ${event.blockNumber} log: ${event.logIndex} transactionHash: ${event.transactionHash}`,
    );
    // during a reorg, the same event can occur in quick succession, so we add everything to a
    // queue so they are processed synchronously
    addCreateOrRemoveEventToQueue(app, {
      event,
      remove: true,
    });
  }

  /**
   * Finds all pending events, updates the # of confirmations.
   */
  async function updateEventConfirmations(currentBlock) {
    sem.take(async () => {
      try {
        const [err, eventsByConfirmations] = await to(
          getPendingEventsByConfirmations(currentBlock),
        );

        if (err) {
          logger.error('Error fetching pending events', err);
          sem.leave();
          return;
        }

        // updated the # of confirmations for the events
        await Promise.all(
          eventsByConfirmations.map(async (e, confirmations) => {
            if (confirmations <= requiredConfirmations && e && e.length) {
              await eventService.patch(
                null,
                { confirmations },
                { query: { blockNumber: e[0].blockNumber } },
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
          if (!block.number) return;
          updateEventConfirmations(block.number);
        })
        .on('error', err => logger.error('SUBSCRIPTION ERROR: ', err)),
    );
  }

  const { liquidPledgingAddress, givethBridgeAddress } = app.get('blockchain');
  const liquidPledging = new LiquidPledging(web3, liquidPledgingAddress);
  const lppCappedMilestone = new LPPCappedMilestone(web3).$contract;
  const lpMilestone = new LPMilestone(web3).$contract;
  const bridgedMilestone = new BridgedMilestone(web3).$contract;
  const milestoneEventDecoder = lppCappedMilestone._decodeEventABI.bind({
    name: 'ALLEVENTS',
    jsonInterface: [
      ...lppCappedMilestone._jsonInterface,
      ...lpMilestone._jsonInterface,
      ...bridgedMilestone._jsonInterface,
    ],
  });

  const enableHomeEvent = !!givethBridgeAddress;
  let givethBridge;

  if (enableHomeEvent) {
    givethBridge = new GivethBridge(homeWeb3, givethBridgeAddress);
  }

  function getMilestoneTopics() {
    return [
      [
        // LPPCappedMilestone
        keccak256('MilestoneCompleteRequested(address,uint64)'),
        keccak256('MilestoneCompleteRequestRejected(address,uint64)'),
        keccak256('MilestoneCompleteRequestApproved(address,uint64)'),
        keccak256('MilestoneChangeReviewerRequested(address,uint64,address)'),
        keccak256('MilestoneReviewerChanged(address,uint64,address)'),
        keccak256('MilestoneChangeRecipientRequested(address,uint64,address)'),
        keccak256('MilestoneRecipientChanged(address,uint64,address)'),
        keccak256('PaymentCollected(address,uint64)'),

        // LPMilestone
        keccak256('RequestReview(address,uint64)'),
        keccak256('RejectCompleted(address,uint64)'),
        keccak256('ApproveCompleted(address,uint64)'),
        keccak256('ReviewerChanged(address,uint64,address)'),

        // BridgedMilestone - excluding duplicate topics
        keccak256('RecipientChanged(address,uint64,address)'),
      ],
      padLeft(`0x${removeHexPrefix(liquidPledging.$address).toLowerCase()}`, 64),
    ];
  }

  /**
   * subscribe to LP events
   */
  function subscribeLP() {
    subscriptions.push(
      liquidPledging.$contract.events
        .allEvents({})
        .on('data', newPendingEvent)
        .on('changed', e => e.removed && removeEvent(e))
        .on('error', err => {
          Sentry.captureException(
            new Error(`Error blockchain connection subscribeLp: ${err.message}`),
          );
          logger.error('SUBSCRIPTION ERROR: ', err);
        }),
    );
  }

  /**
   * subscribe to SetApp events for traces & lpp-campaign
   */
  async function subscribeApps() {
    subscriptions.push(
      kernel.$contract.events
        .SetApp({
          filter: {
            namespace: keccak256('base'),
            name: [
              keccak256('lpp-capped-milestone'),
              keccak256('lpp-lp-milestone'),
              keccak256('lpp-bridged-milestone'),
              keccak256('lpp-campaign'),
            ],
          },
        })
        .on('data', newPendingEvent)
        .on('changed', e => e.removed && removeEvent(e))
        .on('error', err => {
          Sentry.captureException(
            new Error(`Error blockchain connection subscribeApp: ${err.message}`),
          );

          logger.error('SUBSCRIPTION ERROR: ', err);
        }),
    );
  }

  /**
   * subscribe to milestone events associated with the this lp contract
   */
  function subscribeCappedMilestones() {
    subscriptions.push(
      subscribeLogs(web3, getMilestoneTopics())
        .on('data', e => newPendingEvent(milestoneEventDecoder(e)))
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
        .on('data', newPendingEvent)
        .on('changed', e => e.removed && removeEvent(e))
        .on('error', err => {
          Sentry.captureException(
            new Error(`Error blockchain connection subscribe Vault: ${err.message}`),
          );
          logger.error('SUBSCRIPTION ERROR: ', err);
        }),
    );
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
      query: { $limit: 1, $sort: { blockNumber: -1 } },
    });

    const lastDonation = await app.service('donations').find({
      paginate: false,
      query: {
        $limit: 1,
        mined: true,
        status: { $nin: [DonationStatus.PENDING, DonationStatus.FAILED] },
        $sort: { createdAt: -1 },
      },
    });

    if (lastDonation.length > 0) {
      const receipt = await web3.eth.getTransactionReceipt(lastDonation[0].txHash);
      if (receipt.blockNumber > lastEvent.blockNumber) {
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
   * Fetch all events between now and the latest block
   *
   * @param  {Number} [fromBlockNum=lastForeignBlock] The block from which onwards should the events be checked
   * @param  {Number} [toBlockNum=lastForeignBlock+1] No events after this block should be returned
   *
   * @return {Promise} Resolves to an array of events between speciefied block and latest known block.
   */
  async function fetchPastForeignEvents(
    fromBlockNum = lastForeignBlock,
    toBlockNum = lastForeignBlock + 1,
  ) {
    const fromBlock = toHex(fromBlockNum) || toHex(1); // convert to hex due to web3 bug https://github.com/ethereum/web3.js/issues/1097
    const toBlock = toHex(toBlockNum) || toHex(1); // convert to hex due to web3 bug https://github.com/ethereum/web3.js/issues/1097

    // Get the events from contracts
    const events = [].concat(
      await liquidPledging.$contract.getPastEvents({ fromBlock, toBlock }),
      await kernel.$contract.getPastEvents({
        fromBlock,
        toBlock,
        filter: {
          namespace: keccak256('base'),
          name: [
            keccak256('lpp-capped-milestone'),
            keccak256('lpp-lp-milestone'),
            keccak256('lpp-bridged-milestone'),
            keccak256('lpp-campaign'),
          ],
        },
      }),
      await web3.eth
        .getPastLogs({
          fromBlock,
          toBlock,
          topics: getMilestoneTopics(),
        })
        .then(evnts => evnts.map(e => milestoneEventDecoder(e))),
      await lpVault.$contract.getPastEvents({ fromBlock, toBlock }),
    );

    return events.map(e => {
      return { ...e, isHomeEvent: false };
    });
  }

  /**
   * Fetch all events between now and the latest block
   *
   * @param  {Number} [fromBlockNum=lastForeignBlock] The block from which onwards should the events be checked
   * @param  {Number} [toBlockNum=lastForeignBlock+1] No events after this block should be returned
   *
   * @return {Promise} Resolves to an array of events between speciefied block and latest known block.
   */
  async function fetchPastHomeEvents(fromBlockNum = lastHomeBlock, toBlockNum = lastHomeBlock + 1) {
    const fromBlock = fromBlockNum || 1; // convert to hex due to web3 bug https://github.com/ethereum/web3.js/issues/1097
    const toBlock = toBlockNum || 1; // convert to hex due to web3 bug https://github.com/ethereum/web3.js/issues/1097

    // Get the events from contracts
    const events = [].concat(
      await givethBridge.$contract.getPastEvents('PaymentAuthorized', {
        fromBlock,
        toBlock,
      }),

      await givethBridge.$contract.getPastEvents('PaymentExecuted', {
        fromBlock,
        toBlock,
      }),
    );

    return events.map(e => {
      return { ...e, isHomeEvent: true };
    });
  }

  /**
   * Fetch any events that have a status `Waiting`
   *
   * @returns {Promise} Resolves to events sorted by blockNumber, transactionIndex, transactionHash & logIndex
   */
  async function getWaitingEvent() {
    const query = {
      status: EventStatus.WAITING,
      $sort: {
        isHomeEvent: 1,
        blockNumber: 1,
        transactionIndex: 1,
        logIndex: 1,
      },
      $limit: 100,
    };
    return eventService.find({
      query,
    });
  }

  /**
   * Add newEvent to the database if they don't already exist
   *
   * @param {Object} event Event to be added to the database for processing
   * @param {boolean} isReprocess are we reprocessing the event?
   */
  async function newEvent(event, isReprocess = false) {
    logger.info('newEvent called', event.id);

    if (!event || !event.event || !event.signature || !event.returnValues || !event.raw) {
      logger.error('Attempted to add undefined event or event with undefined values: ', event);
      return;
    }

    logger.info(
      `Adding new event. Block: ${event.blockNumber} log: ${event.logIndex} transactionHash: ${event.transactionHash}`,
    );

    try {
      // Check for existing event
      const query = {
        blockNumber: event.blockNumber,
        logIndex: event.logIndex,
        transactionHash: event.transactionHash,
        $limit: 1,
      };
      const events = await eventService.find({ paginate: false, query });

      if (!isReprocess && events.length > 0 && events[0].status !== EventStatus.PENDING) {
        logger.error(
          `Attempt to add an event that already exists. Blocknumber: ${event.blockNumber}, logIndex: ${event.logIndex}, transactionHash: ${event.transactionHash}, status: ${events[0].status}`,
        );
        return;
      }

      if (events.length > 0) {
        // set status to WAITING so it will be processed
        await eventService.patch(events[0]._id, { status: EventStatus.WAITING });
      } else {
        // Create the event in the DB
        await eventService.create({
          ...event,
          confirmations: requiredConfirmations,
          status: EventStatus.WAITING,
        });
      }
    } catch (err) {
      logger.error('Error adding event to the DB', err);
    }
  }

  const addWaitingEventsToQueue = async () => {
    const { data, total, limit } = await getWaitingEvent();
    // eslint-disable-next-line no-restricted-syntax
    for (const event of data) {
      // we should not use forEach, we should use await to make sure events added to queue by order
      // eslint-disable-next-line no-await-in-loop
      await addEventToQueue(app, { event });
    }
    if (total > limit) {
      // we should add all Waiting events to queue, but the feathers has a limit for returning just 100 item
      // in a request, so we should check if there is Waiting events existed we should call this function recursively
      await addWaitingEventsToQueue();
    }
  };

  /**
   * Retrieve and process events from the blockchain between last known block and the latest block
   *
   * @return {Promise}
   */
  const retrieveAndProcessPastEvents = async () => {
    try {
      const foreignFetchBlockNum = (await web3.eth.getBlockNumber()) - requiredConfirmations;
      const homeFetchBlockNum = (await homeWeb3.eth.getBlockNumber()) - requiredConfirmations;

      if (lastForeignBlock < foreignFetchBlockNum && !isFetchingPastForeignEvents) {
        // FIXME: This should likely use semaphore when setting the variable or maybe even better extracted into different loop
        isFetchingPastForeignEvents = true;
        lastForeignBlock += 1;

        try {
          logger.info(
            `Checking new foreign events between blocks ${lastForeignBlock}-${foreignFetchBlockNum}`,
          );

          const events = await fetchPastForeignEvents(lastForeignBlock, foreignFetchBlockNum);

          await Promise.all(events.map(newEvent));

          setLastForeignBlock(foreignFetchBlockNum);
        } catch (err) {
          logger.error('Fetching past events failed: ', err);
        }
        isFetchingPastForeignEvents = false;
      }

      if (enableHomeEvent && lastHomeBlock < homeFetchBlockNum && !isFetchingPastHomeEvents) {
        // FIXME: This should likely use semaphore when setting the variable or maybe even better extracted into different loop
        isFetchingPastHomeEvents = true;
        lastHomeBlock += 1;

        try {
          logger.info(
            `Checking new home events between blocks ${lastHomeBlock}-${homeFetchBlockNum}`,
          );

          const events = await fetchPastHomeEvents(lastHomeBlock, homeFetchBlockNum);

          await Promise.all(events.map(newEvent));

          setLastHomeBlock(homeFetchBlockNum);
        } catch (err) {
          logger.error('Fetching past events failed: ', err);
        }
        isFetchingPastHomeEvents = false;
      }

      await addWaitingEventsToQueue();
    } catch (e) {
      logger.error('error in the processing loop: ', e);
    }
  };

  // exposed api

  return {
    /**
     * Start watching (polling) the blockchain for new transactions
     * This runs interval that checks every x miliseconds (as set in config) for new block and if there are new events processes them
     */
    async start() {
      setLastForeignBlock(await getLastBlock(app));
      setLastHomeBlock(await getLastBlock(app, true));

      const kernelAddress = await liquidPledging.kernel();
      kernel = new Kernel(web3, kernelAddress);

      await checkDonations();

      // start subscriptions
      // ws subscription have proven to be unreliable with Geth. Sometimes
      // events are removed and never re-emitted even though the tx was included
      // after a re-org. Thus we have moved to polling as a more robust way to process
      // events. We keep the subscriptions b/c this enables us to show confirmation #'s
      // in the UI
      if (subscriptions.length) this.close();

      subscribeBlockHeaders();
      subscribeLP();
      subscribeApps();
      subscribeCappedMilestones();
      subscribeVault();
      initNewEventQueue(app);
      initEventHandlerQueue(app);
      // Start polling
      retrieveAndProcessPastEvents();

      const { pollingInterval = 5000 } = app.get('blockchain');
      setInterval(retrieveAndProcessPastEvents, pollingInterval);
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
