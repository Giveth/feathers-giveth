import logger from 'winston';
import { keccak256, padLeft, toHex } from 'web3-utils';
import { Kernel } from 'giveth-liquidpledging';
import { LPPCappedMilestone } from 'lpp-capped-milestone';
import semaphore from 'semaphore';
import Admins from './Admins';
import Pledges from './Pledges';
import Payments from './Payments';
import CappedMilestones from './CappedMilestones';
import createModel from '../models/blockchain.model';
import { getQueue } from '../utils/processingQueue';

const to = require('../utils/to');
const { removeHexPrefix } = require('./web3Helpers');

// Storing this in the db ensures that we don't miss any events on a restart
const defaultConfig = {
  lastBlock: undefined,
};

export default class {
  constructor(app, web3, liquidPledging, txMonitor, opts) {
    this.app = app;
    this.web3 = web3;
    this.txMonitor = txMonitor;
    this.liquidPledging = liquidPledging;
    this.events = app.service('events');
    this.sem = semaphore();

    this.requiredConfirmations = opts.requiredConfirmations || 0;
    this.currentBlock = 0;

    this.newEventQueue = getQueue('NewEventQueue');

    const confirmedEventQueue = getQueue('ConfirmedEventQueue');

    this.payments = new Payments(app, this.liquidPledging.$vault, confirmedEventQueue);
    this.admins = new Admins(app, this.liquidPledging, confirmedEventQueue);
    this.pledges = new Pledges(app, this.liquidPledging, confirmedEventQueue);
    this.cappedMilestones = new CappedMilestones(app, this.web3);
    this.model = createModel(app);

    if (opts.startingBlock && opts.startingBlock !== 0) {
      defaultConfig.lastBlock = opts.startingBlock - 1;
    }
  }

  /**
   * subscribe to all events that we are interested in
   */
  async start() {
    const [config, blockNumber] = await Promise.all([
      this.getConfig(),
      this.web3.eth.getBlockNumber(),
    ]);

    this.config = config;
    this.currentBlock = blockNumber;

    this.subscribeBlockHeaders();
    this.subscribeApps();
    this.subscribeLP();
    this.subscribeCappedMilestones();
    this.subscribeVault();

    this.txMonitor.on(this.txMonitor.LP_EVENT, e => this.newEvent(e, true));
    this.txMonitor.on(this.txMonitor.MILESTONE_EVENT, e => this.newEvent(e, true));
    this.txMonitor.on(this.txMonitor.VAULT_EVENT, e => this.newEvent(e, true));
  }

  // semi-private methods:

  subscribeBlockHeaders() {
    this.web3.eth
      .subscribe('newBlockHeaders')
      .on('data', block => {
        if (!block.number) return;

        this.currentBlock = block.number;
        this.updateEventConfirmations();
      })
      .on('error', err => logger.error('SUBSCRIPTION ERROR: ', err));
  }

  /**
   * subscribe to LP events
   */
  subscribeLP() {
    // starts a listener on the liquidPledging contract
    this.liquidPledging.$contract
      .getPastEvents({ fromBlock: this.config.lastBlock + 1 || 1 })
      .then(events => {
        events.forEach(e => this.newEvent(e));
      });

    // TODO: why isn't this fetching pastEvents? I can't reproduce this when using node directly
    this.liquidPledging.$contract.events
      // .allEvents({ fromBlock: this.config.lastBlock + 1 || 1 })
      .allEvents({})
      .on('data', this.newEvent.bind(this))
      .on('changed', e => e.removed && this.removeEvent(e))
      .on('error', err => logger.error('SUBSCRIPTION ERROR: ', err));
  }

  /**
   * subscribe to SetApp events for lpp-capped-milestone & lpp-campaign
   */
  subscribeApps() {
    this.liquidPledging.kernel().then(kernel => {
      new Kernel(this.web3, kernel).$contract.events
        .SetApp({
          fromBlock: this.config.lastBlock + 1 || 1,
          filter: {
            namespace: keccak256('base'),
            name: [keccak256('lpp-capped-milestone'), keccak256('lpp-campaign')],
          },
        })
        .on('data', this.newEvent.bind(this))
        .on('changed', e => e.removed && this.removeEvent(e))
        .on('error', err => logger.error('SUBSCRIPTION ERROR: ', err));
    });
  }

  /**
   * subscribe to lpp-capped-milestone events associated with the this lp contract
   */
  subscribeCappedMilestones() {
    const c = new LPPCappedMilestone(this.web3).$contract;
    const decodeEventABI = c._decodeEventABI.bind({
      name: 'ALLEVENTS',
      jsonInterface: c._jsonInterface,
    });

    this.subscribeLogs([
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
      padLeft(`0x${removeHexPrefix(this.liquidPledging.$address).toLowerCase()}`, 64),
    ])
      .on('data', e => {
        this.newEvent(decodeEventABI(e));
      })
      .on('changed', e => e.removed && this.removeEvent(e));
  }

  /**
   * subscribe to the lp vault events
   */
  subscribeVault() {
    // starts a listener on the vault contract
    const fromBlock = this.config.lastBlock + 1 || 1;
    this.liquidPledging.$vault.$contract.events
      .allEvents({ fromBlock })
      .on('data', this.newEvent.bind(this))
      .on('changed', e => e.removed && this.removeEvent(e))
      .on('error', err => logger.error('SUBSCRIPTION ERROR: ', err));
  }

  subscribeLogs(topics) {
    const { lastBlock } = this.config;
    // subscribe to events for the given topics
    return this.web3.eth
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
   * get config from database
   *
   * @return {Promise}
   * @private
   */
  getConfig() {
    return new Promise((resolve, reject) => {
      this.model.findOne({}, (err, doc) => {
        if (err) {
          reject(err);
          return;
        }

        if (!doc) {
          resolve(defaultConfig);
          return;
        }

        resolve(doc);
      });
    });
  }

  /**
   * update the config if needed
   *
   * @param blockNumber
   * @private
   */
  updateConfig(blockNumber) {
    let onConfigInitialization;
    if (this.initializingConfig) {
      onConfigInitialization = () => this.updateConfig(blockNumber);
      return;
    }

    if (!this.config.lastBlock || this.config.lastBlock < blockNumber) {
      this.config.lastBlock = blockNumber;

      if (!this.config._id) this.initializingConfig = true;

      this.model.findOneAndUpdate(
        {},
        this.config,
        { upsert: true, new: true },
        (err, numAffected, affectedDocs, upsert) => {
          if (err) logger.error('updateConfig ->', err);

          if (upsert) {
            this.config._id = affectedDocs._id;
            this.initializingConfig = false;
            if (onConfigInitialization) onConfigInitialization();
          }
        },
      );
    }
  }

  /**
   * remove this event if it has yet to be confirmed
   */
  removeEvent(event) {
    const { transactionHash } = event;

    // during a reorg, the same event can occur in quick succession, so we add everything to a
    // queue so they are processed synchronously
    this.newEventQueue.add(transactionHash, () => this.processRemoveEvent(event));

    // start processing the queued events if we haven't already
    if (!this.newEventQueue.isProcessing(transactionHash))
      this.newEventQueue.purge(transactionHash);
  }

  /**
   * Here we remove the event
   *
   * @param {object} event the web3 log to process
   */
  async processRemoveEvent(event) {
    const { id, transactionHash } = event;

    logger.info('attempting to remove event:', event);
    await this.events.remove(undefined, { query: { id, transactionHash, confirmed: false } });

    const { data } = await this.events.find({ query: { id, transactionHash, confirmed: true } });
    if (data.length > 0) {
      logger.error(
        'RE-ORG ERROR: LiquidPledgingMonitor.removeEvent was called, however the matching event has already been confirmed so we did not remove it. Consider increasing the requiredConfirmations.',
        event,
        data,
      );
    }
    await this.eventQueue.purge(transactionHash);
  }

  /**
   * Handle new events as they are emitted, and add them to a queue for sequential
   * processing of events with the same id.
   */
  newEvent(event, reprocess = false) {
    const { transactionHash } = event;

    // during a reorg, the same event can occur in quick succession, so we add everything to a
    // queue so they are processed synchronously
    this.newEventQueue.add(transactionHash, () => this.processNewEvent(event, reprocess));

    // start processing the queued events if we haven't already
    if (!this.newEventQueue.isProcessing(transactionHash))
      this.newEventQueue.purge(transactionHash);
  }

  /**
   * Here we save the event so that they can be processed
   * later after waiting for x number of confirmations (defined in config).
   *
   * @param {object} event the web3 log to process
   * @param {boolean} reprocess reprocess this event if it has already been confirmed?
   */
  async processNewEvent(event, reprocess) {
    const { logIndex, transactionHash } = event;

    const data = await this.events.find({ paginate: false, query: { logIndex, transactionHash } });

    if (data.some(e => e.confirmed)) {
      if (reprocess) {
        if (data.length > 1) {
          logger.error(
            'reprocessing event, but query returned multiple matching events. Only updating the first',
          );
        }

        await this.events.update(data[0]._id, Object.assign({}, event, { confirmed: false }));
        this.newEventQueue.purge(transactionHash);
        return;
      }

      logger.error(
        'RE-ORG ERROR: LiquidPledgingMonitor.newEvent was called, however the matching event has already been confirmed. Consider increasing the requiredConfirmations.',
        event,
        data,
      );
    } else if (data.length > 0) {
      logger.error(
        'RE-ORG ERROR: LiquidPledgingMonitor.newEvent found existing event with matching logIndex and transactionHash.',
        event,
        data,
      );
    }

    await this.events.create(Object.assign({}, event, { confirmations: 0 }));
    this.newEventQueue.purge(transactionHash);
  }

  /**
   * Finds all un-confirmed events, updates the # of confirmations and initiates
   * processing of the event if the requiredConfirmations has been reached
   */
  async updateEventConfirmations() {
    this.sem.take(async () => {
      try {
        const { currentBlock } = this;

        // all unconfirmed events sorted by txHash & logIndex
        const confirmedQuery = { $or: [{ confirmed: false }, { confirmed: { $exists: false } }] };
        const query = Object.assign(
          {
            $sort: { blockNumber: 1, transactionHash: 1, logIndex: 1 },
          },
          confirmedQuery,
        );

        // fetch all un-confirmed events
        const [err, data] = await to(this.events.find({ paginate: false, query }));
        if (err) {
          logger.error('Error fetching un-confirmed events', err);
          this.sem.leave();
          return;
        }

        // sort the events into buckets by # of confirmations
        const eventsByConfirmations = data.reduce((val, event) => {
          const diff = currentBlock - event.blockNumber;
          const c = diff >= this.requiredConfirmations ? this.requiredConfirmations : diff;

          if (this.requiredConfirmations === 0 || c > 0) {
            // eslint-ignore-next-line no-param-reassign
            if (!val[c]) val[c] = [];
            val[c].push(event);
          }
          return val;
        }, []);

        // updated the # of confirmations for the events and process the event if confirmed
        const promises = eventsByConfirmations.map(async (events, confirmations) => {
          if (confirmations === this.requiredConfirmations) {
            const q = Object.assign({}, confirmedQuery, {
              blockNumber: {
                $lte: currentBlock - this.requiredConfirmations,
              },
            });

            await this.events.patch(null, { confirmed: true, confirmations }, { query: q });

            // now that the event is confirmed, handle the event
            events.forEach(event => this.handleEvent(event));
          } else {
            await this.events.patch(
              null,
              { confirmations },
              { query: { blockNumber: currentBlock - this.requiredConfirmations + confirmations } },
            );
          }
        });

        await Promise.all(promises);
      } catch (err) {
        logger.error('error calling updateConfirmations', err);
      }
      this.sem.leave();
    });
  }

  handleEvent(event) {
    logger.info('handlingEvent: ', event);

    switch (event.event) {
      case 'GiverAdded':
        this.admins.addGiver(event);
        break;
      case 'GiverUpdated':
        this.admins.updateGiver(event);
        break;
      case 'DelegateAdded':
        this.admins.addDelegate(event);
        break;
      case 'DelegateUpdated':
        this.admins.updateDelegate(event);
        break;
      case 'ProjectAdded':
        this.admins.addProject(event);
        break;
      case 'ProjectUpdated':
        this.admins.updateProject(event);
        break;
      case 'CancelProject':
        this.admins.cancelProject(event);
        break;
      case 'Transfer':
        this.pledges.transfer(event);
        break;
      case 'AuthorizePayment':
        this.payments.authorizePayment(event);
        break;
      case 'ConfirmPayment':
        this.payments.confirmPayment(event);
        break;
      case 'CancelPayment':
        this.payments.cancelPayment(event);
        break;
      case 'SetApp':
        this.admins.setApp(event);
        break;
      case 'MilestoneCompleteRequested':
        this.cappedMilestones.reviewRequested(event);
        break;
      case 'MilestoneCompleteRequestRejected':
        this.cappedMilestones.rejected(event);
        break;
      case 'MilestoneCompleteRequestApproved':
        this.cappedMilestones.accepted(event);
        break;
      case 'MilestoneChangeReviewerRequested':
      case 'MilestoneReviewerChanged':
      case 'MilestoneChangeRecipientRequested':
      case 'MilestoneRecipientChanged':
        logger.warn(`unhandled event: ${event.event}`, event);
        break;
      case 'PaymentCollected':
        this.cappedMilestones.paymentCollected(event);
        break;
      default:
        logger.error('Unknown event: ', event);
    }
  }
}
