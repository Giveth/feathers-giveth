const { LiquidPledging, LPVault, Kernel } = require('giveth-liquidpledging');
const { LPPCappedMilestone } = require('lpp-capped-milestone');
const { keccak256, padLeft, toHex } = require('web3-utils');
const logger = require('winston');

const processingQueue = require('../utils/processingQueue');
const to = require('../utils/to');
const { removeHexPrefix } = require('./lib/web3Helpers');

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
 * fetch any events that have yet to be confirmed
 * @param {object} feathersjs `events` service
 * @returns {array} events sorted by transactionHash & logIndex
 */
async function getUnconfirmedEvents(eventsService) {
  const confirmedQuery = { $or: [{ confirmed: false }, { confirmed: { $exists: false } }] };
  // all unconfirmed events sorted by txHash & logIndex
  const query = Object.assign(
    {
      $sort: { transactionHash: 1, logIndex: 1 },
    },
    confirmedQuery,
  );
  return eventsService.find({ paginate: false, query });
}

/**
 *
 * @param {object} web3 Web3 instance
 * @param {int} lastBlock lastBlock that logs were retrieved from
 * @param {array} topics topics to subscribe to
 */
function subscribeLogs(web3, lastBlock, topics) {
  // subscribe to events for the given topics
  return web3.eth
    .subscribe(
      'logs',
      {
        fromBlock: lastBlock ? toHex(lastBlock + 1) : toHex(1), // convert to hex due to web3 bug https://github.com/ethereum/web3.js/issues/1097
        topics,
      },
      () => {},
    ) // TODO fix web3 bug so we don't have to pass a cb
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

  let initialized = false;
  let lastBlock = 0;

  function setLastBlock(blockNumber) {
    if (blockNumber > lastBlock) lastBlock = blockNumber;
  }

  /**
   * Here we save the event so that they can be processed
   * later after waiting for x number of confirmations (defined in config).
   *
   * @param {string} hash a unique identifier for this event
   * @param {object} event the web3 log to process
   */
  async function processNewEvent(hash, event) {
    const { id, raw } = event;
    const data = await eventService.find({ paginate: false, query: { id } });

    // this is a new event so we create it
    if (data.length === 0) {
      await eventService.create(Object.assign({}, event, { confirmations: 0 }));
      queue.purge(hash);
      return;
    }

    // shouldn't have more then 1 event
    if (data.length > 1) {
      logger.error(
        'attemping to process new event but found more then 1 matching event.',
        event,
        data,
      );
    }

    // An event w/ the same id already exists
    const oldEvent = data[0];

    const mutation = Object.assign({}, oldEvent, event);

    if (oldEvent.confirmed) {
      // log an error if this event is already confirmed
      // this shouldn't happen and is most likely because a large re-org occurred
      logger.error(
        'RE-ORG ERROR: attempting to process newEvent, however the matching event has already been confirmed. Consider increasing the requiredConfirmations.',
        event,
        oldEvent,
      );

      // if the event data has changed, we need to set confirmed = false
      // so this event is picked up for processing
      if (JSON.stringify(oldEvent.raw) !== JSON.stringify(raw)) {
        // TODO the event data is different then prevously processed. We need to update the models in feathers.
        // need to test this, but maybe just re-processing the event is enough
        mutation.confirmed = false;
      }
    }

    if (mutation.confirmations) {
      const diff = mutation.blockNumber - oldEvent.blockNumber;

      if (diff > 0) {
        mutation.confirmations += diff;
      } else if (diff < 0) {
        mutation.confirmations -= diff;
      }
    }

    await eventService.patch(oldEvent._id, mutation);
    queue.purge(hash);
  }

  async function getUnconfirmedEventsByConfirmations(currentBlock) {
    const unconfirmedEvents = await getUnconfirmedEvents(eventService);

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
  async function newEvent(event) {
    setLastBlock(event.blockNumber);

    // NOTE: we don't provide a shortcircut here b/c we want to persist all events

    const { address, signature, transactionHash, raw } = event;
    // TODO why do we generate a hash? event.id may not be the same incase of a reorg
    const hash = keccak256(address + signature + transactionHash + JSON.stringify(raw));

    // during a reorg, the same event can occur in quick succession, so we add everything to a
    // queue so they are processed synchronously
    queue.add(hash, () => processNewEvent(hash, event));

    // start processing the queued events if we haven't already
    if (!queue.isProcessing(hash)) queue.purge(hash);
  }

  /**
   * Finds all un-confirmed events, updates the # of confirmations and initiates
   * processing of the event if the requiredConfirmations has been reached
   */
  async function updateEventConfirmations(currentBlock) {
    const confirmedQuery = { $or: [{ confirmed: false }, { confirmed: { $exists: false } }] };

    const [err, eventsByConfirmations] = await to(
      getUnconfirmedEventsByConfirmations(currentBlock),
    );

    if (err) {
      logger.error('Error fetching un-confirmed events', err);
      return;
    }

    // updated the # of confirmations for the events and proceess the event if confirmed
    eventsByConfirmations.forEach((e, confirmations) => {
      if (confirmations === requiredConfirmations) {
        const q = Object.assign({}, confirmedQuery, {
          blockNumber: {
            $lte: currentBlock - requiredConfirmations,
          },
        });

        eventService.patch(null, { confirmed: true, confirmations }, { query: q });

        // now that the event is confirmed, handle the event
        e.forEach(event => eventHandler.handle(event));
      } else {
        eventService.patch(
          null,
          { confirmations },
          { query: { blockNumber: currentBlock - requiredConfirmations + confirmations } },
        );
      }
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

  const { liquidPledgingAddress } = app.get('blockchain');
  const liquidPledging = new LiquidPledging(web3, liquidPledgingAddress);

  /**
   * subscribe to LP events
   */
  function subscribeLP() {
    // starts a listener on the liquidPledging contract
    liquidPledging.$contract.getPastEvents({ fromBlock: lastBlock + 1 || 1 }).then(events => {
      events.forEach(newEvent);
    });

    // TODO: why isn't this fetching pastEvents? I can't reproduce this when using node directly
    subscriptions.push(
      liquidPledging.$contract.events
        // .allEvents({ fromBlock: this.config.lastBlock + 1 || 1 })
        .allEvents({})
        .on('data', newEvent)
        .on('error', err => logger.error('SUBSCRIPTION ERROR: ', err)),
    );
  }

  /**
   * subscribe to SetApp events for lpp-capped-milestone & lpp-campaign
   */
  async function subscribeApps() {
    const kernel = await liquidPledging.kernel();
    subscriptions.push(
      new Kernel(web3, kernel).$contract.events
        .SetApp({
          fromBlock: lastBlock + 1 || 1,
          filter: {
            namespace: keccak256('base'),
            name: [keccak256('lpp-capped-milestone'), keccak256('lpp-campaign')],
          },
        })
        .on('data', newEvent)
        .on('error', err => logger.error('SUBSCRIPTION ERROR: ', err)),
    );
  }

  /**
   * subscribe to lpp-capped-milestone events associated with the this lp contract
   */
  function subscribeCappedMilestones() {
    const c = new LPPCappedMilestone(web3).$contract;
    const decodeEventABI = c._decodeEventABI.bind({
      name: 'ALLEVENTS',
      jsonInterface: c._jsonInterface,
    });

    subscriptions.push(
      subscribeLogs(web3, lastBlock, [
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
      ]).on('data', e => {
        newEvent(decodeEventABI(e));
      }),
    );
  }

  /**
   * subscribe to the lp vault events
   */
  function subscribeVault() {
    const { vaultAddress } = app.get('blockchain');
    const lpVault = new LPVault(web3, vaultAddress);
    // starts a listener on the vault contract
    const fromBlock = lastBlock + 1 || 1;
    subscriptions.push(
      lpVault.$contract.events
        .allEvents({ fromBlock })
        .on('data', newEvent)
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
