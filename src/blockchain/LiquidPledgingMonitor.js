import logger from 'winston';
import { utils } from 'web3';
import { Kernel, LiquidPledgingState } from 'giveth-liquidpledging';
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
    this.getConfig().then(config => {
      this.config = config;
      this.subscribeApps();
      this.subscribeLP();
      this.subscribeCappedMilestones();
      this.subscribeVault();
      this.subscribeGenerateTokens();
      this.subscribeDestroyTokens();
    });

    this.txMonitor.on(this.txMonitor.LP_EVENT, this.handleEvent.bind(this));
    this.txMonitor.on(this.txMonitor.MILESTONE_EVENT, this.handleEvent.bind(this));
    this.txMonitor.on(this.txMonitor.VAULT_EVENT, this.handleEvent.bind(this));
  }

  // semi-private methods:

  /**
   * subscribe to LP events
   */
  subscribeLP() {
    // starts a listener on the liquidPledging contract
    this.liquidPledging.$contract.events
      .allEvents({ fromBlock: this.config.lastBlock + 1 || 1 })
      .on('data', this.handleEvent.bind(this))
      .on('changed', event => {
        // I think this is emitted when a chain reorg happens and the tx has been removed
        logger.info('changed: ', event);
        new LiquidPledgingState(this.liquidPledging).getState().then(state => {
          logger.info('liquidPledging state at changed event: ', JSON.stringify(state, null, 2));
        });
      })
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
        .on('data', this.handleEvent.bind(this))
        .on('changed', event => {
          logger.info('SetApp event changed: ', event);
        })
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
      this.handleEvent(decodeEventABI(e));
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
      .on('data', this.handleEvent.bind(this))
      .on('changed', event => {
        // I think this is emitted when a chain reorg happens and the tx has been removed
        logger.info('vault changed: ', event);
      })
      .on('error', err => logger.error('SUBSCRIPTION ERROR: ', err));
  }

  /**
   * subscribe to GenerateTokens event for any liquidPledging lpp-campaign & lpp-dac plugins
   */
  subscribeGenerateTokens() {
    this.subscribeLogs([
      keccak256('GenerateTokens(address,address,uint256)'), // hash of the event signature we're interested in
      utils.padLeft(`0x${this.liquidPledging.$address.substring(2).toLowerCase()}`, 64), // remove leading 0x from address
    ]).on('data', this.tokens.tokensGenerated.bind(this.tokens));
  }

  /**
   * subscribe to DestroyTokens event for any liquidPledging lpp-dac plugins
   */
  subscribeDestroyTokens() {
    this.subscribeLogs([
      keccak256('DestroyTokens(address,address,uint256)'), // hash of the event signature we're interested in
      utils.padLeft(`0x${this.liquidPledging.$address.substring(2).toLowerCase()}`, 64), // remove leading 0x from address
    ]).on('data', this.tokens.tokensDestroyed.bind(this.tokens));
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
      .on('changed', event => {
        // this is emitted when a chain reorg happens and the tx may have been removed or mined in another block
        logger.info(`${event.event} changed: `, event);
        // TODO handle chain reorgs
      })
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

  handleEvent(event) {
    this.updateConfig(event.blockNumber);

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
