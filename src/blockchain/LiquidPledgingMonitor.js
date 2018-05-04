import logger from 'winston';
import { utils } from 'web3';
import { Kernel } from 'giveth-liquidpledging';
import { LPPCappedMilestone } from 'lpp-capped-milestone';
import Admins from './Admins';
import Pledges from './Pledges';
import Payments from './Payments';
import CappedMilestones from './CappedMilestones';
import Tokens from './Tokens';
import createModel from '../models/blockchain.model';
import EventQueue from './EventQueue';

const { keccak256 } = utils;

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
    this.newEvents = {};

    this.requiredConfirmations = opts.requiredConfirmations || 0;
    this.currentBlock = 0;

    this.eventQueue = new EventQueue();
    // use different EventQueues for Admins & Pledges class
    const eventQueue = new EventQueue();

    this.payments = new Payments(app, this.liquidPledging.$vault);
    this.admins = new Admins(app, this.liquidPledging, eventQueue);
    this.pledges = new Pledges(app, this.liquidPledging, eventQueue);
    this.cappedMilestones = new CappedMilestones(app, this.web3);
    this.tokens = new Tokens(app, this.web3);
    this.model = createModel(app);

    if (opts.startingBlock && opts.startingBlock !== 0) {
      defaultConfig.lastBlock = opts.startingBlock - 1;
    }
  }

  /**
   * subscribe to all events that we are interested in
   */
  start() {
    Promise.all([this.getConfig(), this.web3.eth.getBlockNumber()]).then(
      ([config, blockNumber]) => {
        this.config = config;
        this.currentBlock = blockNumber;
        this.subscribeBlockHeaders();
        this.subscribeApps();
        this.subscribeLP();
        this.subscribeCappedMilestones();
        this.subscribeVault();
        this.subscribeGenerateTokens();
        this.subscribeDestroyTokens();
      },
    );

    this.txMonitor.on(this.txMonitor.LP_EVENT, this.newEvent.bind(this));
    this.txMonitor.on(this.txMonitor.MILESTONE_EVENT, this.newEvent.bind(this));
    this.txMonitor.on(this.txMonitor.VAULT_EVENT, this.newEvent.bind(this));
  }

  // semi-private methods:

  subscribeBlockHeaders() {
    this.web3.eth
      .subscribe('newBlockHeaders')
      .on('data', block => {
        if (!block.number) return;

        this.currentBlock = block.number;
        this.updateConfirmations();
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
      utils.padLeft(`0x${this.liquidPledging.$address.substring(2).toLowerCase()}`, 64), // remove leading 0x from address
    ]).on('data', e => {
      this.newEvent(decodeEventABI(e));
    });
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
      .on('error', err => logger.error('SUBSCRIPTION ERROR: ', err));
  }

  /**
   * subscribe to GenerateTokens event for any liquidPledging lpp-campaign & lpp-dac plugins
   */
  subscribeGenerateTokens() {
    this.subscribeLogs([
      keccak256('GenerateTokens(address,address,uint256)'), // hash of the event signature we're interested in
      utils.padLeft(`0x${this.liquidPledging.$address.substring(2).toLowerCase()}`, 64), // remove leading 0x from address
    ]).on('data', e => this.newEvent(Tokens.decodeGenerateTokensEventABI(e)));
  }

  /**
   * subscribe to DestroyTokens event for any liquidPledging lpp-dac plugins
   */
  subscribeDestroyTokens() {
    this.subscribeLogs([
      keccak256('DestroyTokens(address,address,uint256)'), // hash of the event signature we're interested in
      utils.padLeft(`0x${this.liquidPledging.$address.substring(2).toLowerCase()}`, 64), // remove leading 0x from address
    ]).on('data', e => this.newEvent(Tokens.decodeDestroyTokensEventABI(e)));
  }

  subscribeLogs(topics) {
    const { lastBlock } = this.config;
    // start a listener for all DestroyToken events associated with this liquidPledging contract
    return this.web3.eth
      .subscribe(
        'logs',
        {
          fromBlock: lastBlock ? utils.toHex(lastBlock + 1) : utils.toHex(1), // convert to hex due to web3 bug https://github.com/ethereum/web3.js/issues/1097
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

      this.model.update(
        { _id: this.config._id },
        this.config,
        { upsert: true },
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
   * Handle new events as they are emitted. Here we save the event so that they can be processed
   * later after waiting for x number of confirmations (defined in config).
   */
  newEvent(event) {
    this.updateConfig(event.blockNumber);

    // NOTE: perissology: I'm not sure if we want to do this. If we uncomment the following code, we won't have
    // the events won't be stored in the events db
    // on startup, we fetch past logs. We can immediatly process the event if the required confirmatinos have past
    // if (event.blockNumber >= this.currentBlock - this.requiredConfirmations) {
    //   this.handleEvent(event);
    //   return;
    // }

    const { id, address, signature, transactionHash, raw } = event;
    const hash = utils.keccak256(address + signature + transactionHash + JSON.stringify(raw));

    // during a reorg, the same event can occur in quick succession, so we cache the event until
    // it has been successfully saved
    if (!this.newEvents[transactionHash]) this.newEvents[transactionHash] = [];
    this.newEvents[transactionHash].push(Object.assign({}, event, { hash }));

    const removeFromCache = () => {
      const i = this.newEvents[transactionHash].findIndex(ev => ev.hash === hash && ev.id === id);
      this.newEvents[transactionHash].splice(i, 1);
      if (this.newEvents[transactionHash].length === 0) delete this.newEvents[transactionHash];
    };

    this.events.find({ paginate: false, query: { id } }).then(data => {
      if (data.length === 0) {
        // re-org may have occurred, check if we have a cached event
        const existingEvent = this.newEvents[transactionHash].find(
          ev => ev.hash === hash && ev.id !== id,
        );

        // if we have a cached event, add this one to the queue so it will be processed
        // after the event it is replacing
        if (existingEvent) {
          this.eventQueue.add(hash, () => this.newEvent(event));
        } else {
          this.events.create(event).then(() => {
            removeFromCache();
            this.eventQueue.purge(hash);
          });
        }
        return;
      }

      if (data.length > 1) {
        logger.error(
          'LiquidPledgingMonitor.newEvent found more then 1 matching event.',
          event,
          data,
        );
      }

      const oldEvent = data[0];

      const mutation = Object.assign({}, oldEvent, event);
      if (oldEvent.confirmed) {
        logger.error(
          'RE-ORG ERROR: LiquidPledgingMonitor.newEvent was called, however the matching event has already been confirmed. Consider increasing the requiredConfirmations.',
          event,
          oldEvent,
        );

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

      this.events.patch(oldEvent._id, mutation).then(() => removeFromCache());
    });
  }

  updateConfirmations() {
    const { currentBlock } = this;

    // fetch all un-confirmend events
    this.events
      .find({
        paginate: false,
        query: { $or: [{ confirmed: false }, { confirmed: { $exists: false } }] },
      })
      .then(data => {
        const updates = [];

        data.forEach(event => {
          const diff = currentBlock - event.blockNumber;
          const c = diff >= this.requiredConfirmations ? this.requiredConfirmations : diff;

          if (c > 0) {
            if (!updates[c]) updates[c] = [];
            updates[c].push(event);
          }
        });

        // updated the # of confirmations
        updates.forEach((events, confirmations) => {
          if (confirmations === this.requiredConfirmations) {
            const query = {
              $and: [
                {
                  confirmed: {
                    $exists: false,
                  },
                },
                {
                  blockNumber: {
                    $lte: currentBlock - this.requiredConfirmations,
                  },
                },
              ],
            };

            this.events.patch(null, { confirmed: true, confirmations }, { query });
            // now that the event is confirmed, handle the event
            events.forEach(event => this.handleEvent(event));
          } else {
            this.events.patch(
              null,
              { confirmations },
              { query: { blockNumber: currentBlock - this.requiredConfirmations + confirmations } },
            );
          }
        });
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
      case 'GenerateTokens':
        this.tokens.tokensGenerated(event);
        break;
      case 'DestroyTokens':
        this.tokens.tokensDestroyed(event);
        break;
      default:
        logger.error('Unknown event: ', event);
    }
  }
}
