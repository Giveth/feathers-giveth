import Admins from './Admins';
import Pledges from './Pledges';
import Payments from './Payments';
import Milestones from './Milestones';
import createModel from '../models/blockchain.model';
import EventQueue from './EventQueue';


// Storing this in the db ensures that we don't miss any events on a restart
const defaultConfig = {
  lastBlock: undefined,
};

export default class {
  constructor(app, liquidPledging, opts) {
    this.app = app;
    this.web3 = liquidPledging.$web3;
    this.contract = liquidPledging.$contract;
    this.liquidPledging = liquidPledging;

    const eventQueue = new EventQueue();

    this.payments = new Payments(app, liquidPledging.$vault);
    this.admins = new Admins(app, liquidPledging, eventQueue);
    this.pledges = new Pledges(app, liquidPledging, eventQueue);
    this.milestones = new Milestones(app, this.web3);
    this.model = createModel(app);

    if (opts.startingBlock && opts.startingBlock !== 0) {
      defaultConfig.lastBlock = opts.startingBlock - 1;
    }
  }

  /**
   * start monitoring contract events
   */
  start() {
    // starts listening to all events emitted by liquidPledging and delegates to the appropriate class
    this._getConfig()
      .then(config => this.config = config)
      .then(() => this._startListeners());
  }

  /**
   * start listening to allEvents on the contract
   * @private
   */
  _startListeners() {
    // starts a listener on the liquidPledging contract
    this.contract.events.allEvents({ fromBlock: this.config.lastBlock + 1 || 1 })
      .on('data', this._handleEvent.bind(this))
      .on('changed', (event) => {
        // I think this is emitted when a chain reorg happens and the tx has been removed
        console.log('changed: ', event); // eslint-disable-line no-console
        this.liquidPledging.getState()
          .then(state => {
            console.log('liquidPledging state at changed event: ', JSON.stringify(state, null, 2)); //eslint-disable-line no-console
          });
      })
      // TODO if the connection dropped, do we need to try and reconnect?
      .on('error', err => console.error('SUBSCRIPTION ERROR error: ', err));

    // start a listener for all milestones associated with this liquidPledging contract
    this.web3.eth.subscribe('logs', {
      fromBlock: this.web3.utils.toHex(this.config.lastBlock + 1) || this.web3.utils.toHex(1), // convert to hex due to web3 bug https://github.com/ethereum/web3.js/issues/1097
      topics: [
        this.web3.utils.keccak256('MilestoneAccepted(address)'), // hash of the event signature we're interested in
        this.web3.utils.padLeft(`0x${this.liquidPledging.$address.substring(2).toLowerCase()}`, 64), // remove leading 0x from address
      ],
    }, () => {
    }) // TODO fix web3 bug so we don't have to pass a cb
      .on('data', this.milestones.milestoneAccepted.bind(this.milestones))
      .on('changed', (event) => {
        // I think this is emitted when a chain reorg happens and the tx has been removed
        console.log('lpp-milestone changed: ', event); // eslint-disable-line no-console
        // TODO handle chain reorgs
      })
      .on('error', err => console.error('error: ', err)); // eslint-disable-line no-console

    // starts a listener on the liquidPledging contract
    this.liquidPledging.$vault.$contract.events.allEvents({ fromBlock: this.config.lastBlock + 1 || 1 })
      .on('data', this._handleVaultEvent.bind(this))
      .on('changed', (event) => {
        // I think this is emitted when a chain reorg happens and the tx has been removed
        console.log('vault changed: ', event); // eslint-disable-line no-console
      })
      // TODO if the connection dropped, do we need to try and reconnect?
      .on('error', err => console.error('error: ', err)); // eslint-disable-line no-console

  }

  /**
   * get config from database
   *
   * @return {Promise}
   * @private
   */
  _getConfig() {
    return new Promise((resolve, reject) => {
      this.model.findOne({}, (err, doc) => {
        if (err) return reject(err);

        if (!doc) return resolve(defaultConfig);

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
  _updateConfig(blockNumber) {
    if (this._initializingConfig) {
      this._onConfigInitialization = () => this._updateConfig(blockNumber);
      return;
    }

    if (!this.config.lastBlock || this.config.lastBlock < blockNumber) {
      this.config.lastBlock = blockNumber;

      if (!this.config._id) this._initializingConfig = true;

      this.model.update({ _id: this.config._id }, this.config, { upsert: true }, (err, numAffected, affectedDocs, upsert) => {
        if (err) console.error('updateConfig ->', err); // eslint-disable-line no-console

        if (upsert) {
          this.config._id = affectedDocs._id;
          this._initializingConfig = false;
          if (this._onConfigInitialization) this._onConfigInitialization();
        }
      });
    }
  }

  _handleEvent(event) {
    this._updateConfig(event.blockNumber);

    console.log('handlingEvent: ', event);

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
      default:
        console.error('Unknown event: ', event); //eslint-disable-line no-console
    }
  }

  _handleVaultEvent(event) {
    this._updateConfig(event.blockNumber);

    console.log('handling vault event ->', event);

    switch (event.event) {
      case 'AuthorizePayment':
        this.payments.authorizePayment(event);
        break;
      case 'ConfirmPayment':
        this.payments.confirmPayment(event);
        break;
      case 'CancelPayment':
        this.payments.cancelPayment(event);
        break;
      default:
        console.error('Unknown event: ', event); // eslint-disable-line no-console
    }
  }
}
