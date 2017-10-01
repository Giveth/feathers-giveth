import Managers from './Managers';
import Notes from './Notes';
import Milestones from './Milestones';
import createModel from '../models/blockchain.model';


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
    this.managers = new Managers(app, liquidPledging);
    this.notes = new Notes(app, liquidPledging);
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
      .on('error', err => console.error('error: ', err));

    // start a listener for all milestones associated with this liquidPledging contract
    this.web3.eth.subscribe('logs', {
      fromBlock: this.config.lastBlock + 1 || 1,
      topics: [
        this.web3.utils.keccak256('StateChanged(address,uint8)'), // hash of the event signature we're interested in
        this.web3.utils.padLeft(`0x${this.liquidPledging.$address.substring(2).toLowerCase()}`, 64), // remove leading 0x from address
      ]
    }, () => {}) // TODO fix web3 bug so we don't have to pass a cb
      .on('data', this.milestones.stateChanged.bind(this.milestones))
      .on('changed', (event) => {
        // I think this is emitted when a chain reorg happens and the tx has been removed
        console.log('lpp-milestone changed: ', event); // eslint-disable-line no-console
        // TODO handle chain reorgs
      })
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
      case 'DonorAdded':
        this.managers.addDonor(event);
        break;
      case 'DonorUpdated':
        this.managers.updateDonor(event);
        break;
      case 'DelegateAdded':
        this.managers.addDelegate(event);
        break;
      case 'DelegateUpdated':
        this.managers.updateDelegate(event);
        break;
      case 'ProjectAdded':
        this.managers.addProject(event);
        break;
      case 'ProjectUpdated':
        this.managers.updateProject(event);
        break;
      case 'Transfer':
        this.notes.transfer(event);
        break;
      default:
        console.error('Unknown event: ', event); //eslint-disable-line no-console
    }
  }
}
