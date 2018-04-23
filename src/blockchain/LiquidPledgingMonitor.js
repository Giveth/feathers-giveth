import logger from 'winston';
import Admins from './Admins';
import Pledges from './Pledges';
import Payments from './Payments';
import CappedMilestones from './CappedMilestones';
import Tokens from './Tokens';
import createModel from '../models/blockchain.model';
import EventQueue from './EventQueue';
import { LiquidPledgingState } from 'giveth-liquidpledging';

// Storing this in the db ensures that we don't miss any events on a restart
const defaultConfig = {
  lastBlock: undefined,
};

export default class {
  constructor(app, web3, liquidPledging, cappedMilestones, lppDacs, txMonitor, opts) {
    this.app = app;
    this.web3 = web3;
    this.txMonitor = txMonitor;
    this.cappedMilestonesContract = cappedMilestones;
    this.liquidPledging = liquidPledging;
    this.lppDacs = lppDacs;

    const eventQueue = new EventQueue();

    this.payments = new Payments(app, this.liquidPledging.$vault);
    this.admins = new Admins(app, this.liquidPledging, this.lppDacs, eventQueue);
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
    // starts listening to all events emitted by liquidPledging and delegates
    // to the appropriate class
    this.getConfig().then(config => {
      this.config = config;
      this.subscribeLP();
      this.subscribeCappedMilestones();
      this.subscribeVault();
      this.subscribeCampaignTokens();
      this.subscribeDacTokens();
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
   * subscribe to lpp-capped-milestone events associated with the this lp contract
   */
  subscribeCappedMilestones() {
    this.cappedMilestonesContract.$contract.events
      .allEvents({ fromBlock: this.config.lastBlock + 1 || 1 })
      .on('data', this.handleEvent.bind(this))
      .on('changed', event => {
        // I think this is emitted when a chain reorg happens and the tx has been removed
        logger.error('lpp-capped-milestone changed: ', event);
        // TODO handle chain reorgs
      })
      .on('error', err => logger.error('SUBSCRIPTION ERROR: ', err));
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
   * subscribe to GenerateTokens event for any liquidPledging lpp-campaign plugins
   */
  subscribeCampaignTokens() {
    // start a listener for all GenerateToken events associated with this liquidPledging contract
    this.web3.eth
      .subscribe(
        'logs',
        {
          fromBlock: this.web3.utils.toHex(this.config.lastBlock + 1) || this.web3.utils.toHex(1), // convert to hex due to web3 bug https://github.com/ethereum/web3.js/issues/1097
          topics: [
            this.web3.utils.keccak256('GenerateTokens(address,address,uint256)'), // hash of the event signature we're interested in
            this.web3.utils.padLeft(
              `0x${this.liquidPledging.$address.substring(2).toLowerCase()}`,
              64,
            ), // remove leading 0x from address
          ],
        },
        () => {},
      ) // TODO fix web3 bug so we don't have to pass a cb
      .on('data', this.tokens.campaignTokensGenerated.bind(this.tokens))
      .on('changed', event => {
        // I think this is emitted when a chain reorg happens and the tx has been removed
        logger.info('GenerateTokens changed: ', event);
        // TODO handle chain reorgs
      })
      .on('error', err => logger.error('SUBSCRIPTION ERROR: ', err));
  }

  /**
   * subscribe to GenerateTokens event for lpp-dac plugin
   */
  subscribeDacTokens() {
    // starts a listener on the vault contract
    const fromBlock = this.config.lastBlock + 1 || 1;
    this.lppDacs.$contract.events
      .allEvents({ fromBlock })
      .on('data', this.handleEvent.bind(this))
      .on('changed', event => {
        // I think this is emitted when a chain reorg happens and the tx has been removed
        logger.info('lppDacs changed: ', event);
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
      case 'MilestoneAccepted':
        this.cappedMilestones.milestoneAccepted(event);
        break;
      case 'PaymentCollected':
        this.cappedMilestones.paymentCollected(event);
        break;
      case 'GenerateTokens':
        this.tokens.dacTokensGenerated(event);
        break;
      case 'DestroyTokens':
        this.tokens.dacTokensDestroyed(event);
        break;
      default:
        logger.error('Unknown event: ', event);
    }
  }
}
