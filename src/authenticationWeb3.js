const Debug = require('debug');
const merge = require('lodash.merge');
const omit = require('lodash.omit');
const pick = require('lodash.pick');

const Web3Strategy = require('./Web3Strategy');

// TODO clean this up and split to separate package

const debug = Debug('feathers-authentication-web3');

class Web3Challenger {
  constructor(app, options = {}) {
    this.app = app;
    this.options = options;
    this.service =
      typeof options.service === 'string' ? app.service(options.service) : options.service;
    this.challengeService =
      typeof options.challengeService === 'string'
        ? app.service(options.challengeService)
        : options.challengeService;

    if (!this.service) {
      throw new Error(
        'options.service does not exist.\n\tMake sure you are passing a valid service path or service instance and it is initialized before feathers-authentication-web3.',
      );
    }
    if (!this.challengeService) {
      throw new Error(
        'options.challengeService does not exist.\n\tMake sure you are passing a valid service path or service instance and it is initialized before feathers-authentication-web3.',
      );
    }
  }

  verify(address, done) {
    debug(`Fetching user for address: ${address}`);

    const returnPayload = (entity, newUser) => {
      // try to remove the challenge for this user, ignoring any errors
      this.challengeService.remove(address).catch();

      const id = entity[this.service.id];
      const payload = { [`${this.options.entity}Id`]: id };

      if (newUser) {
        payload.newUser = true;
      }

      done(null, entity, payload);
    };

    this.service
      .get(address)
      .then(user => returnPayload(user, !user.name)) // assuming this is a newUser if no name has been set
      .catch(err => {
        if (err.name === 'NotFound') {
          this.service
            .create({ address })
            .then(addr => returnPayload(addr, true))
            .catch(done);

          return;
        }
        done(err);
      });
  }

  getMessage(address, done) {
    debug(`Fetching challenge message for address: ${address}`);

    this.challengeService
      .get(address)
      .then(message => {
        debug(`Found challenge message: ${message}`);
        done(null, message);
      })
      .catch(done);
  }

  generateMessage(address, done) {
    debug(`Generating challenge message for address: ${address}`);
    this.challengeService
      .create({ address })
      .then(message => {
        debug(`Created challenge message: ${message}`);
        return done(null, message);
      })
      .catch(done);
  }
}

const defaults = {
  name: 'web3',
};

const KEYS = ['secret', 'header', 'entity', 'service', 'passReqToCallback', 'session', 'jwt'];

function web3(options = {}) {
  return function setup() {
    const app = this;
    const _super = app.setup;

    if (!app.passport) {
      throw new Error(
        'Can not find app.passport. Did you initialize feathers-authentication before feathers-authentication-web3?',
      );
    }

    const authOptions = app.get('auth') || app.get('authentication') || {};
    const web3Options = authOptions[options.name] || {};

    web3Options.challengeService = 'authentication/challenges';

    const web3Settings = merge(
      {},
      defaults,
      pick(authOptions, KEYS),
      web3Options,
      omit(options, ['Verifier']),
    );

    // if (typeof jwtSettings.header !== 'string') {
    //   throw new Error('You must provide a \'header\' in your authentication configuration or pass one explicitly');
    // }
    //
    // if (typeof jwtSettings.secret === 'undefined') {
    //   throw new Error('You must provide a \'secret\' in your authentication configuration or pass one explicitly');
    // }
    //
    let Challenger = Web3Challenger;
    // let Verifier = DefaultVerifier;
    // let strategyOptions = merge({
    //   secretOrKey: jwtSettings.secret,
    //   jwtFromRequest: ExtractJwt.fromExtractors([
    //     ExtractJwt.fromAuthHeaderWithScheme('Bearer'),
    //     ExtractJwt.fromHeader(jwtSettings.header.toLowerCase()),
    //     ExtractJwt.fromBodyField(jwtSettings.bodyKey)
    //   ])
    // }, jwtSettings.jwt, omit(jwtSettings, ['jwt', 'header', 'secret']));
    //
    // // Normalize algorithm key
    // if (!strategyOptions.algorithms && strategyOptions.algorithm) {
    //   strategyOptions.algorithms = Array.isArray(strategyOptions.algorithm) ? strategyOptions.algorithm : [strategyOptions.algorithm];
    //   delete strategyOptions.algorithm;
    // }
    //
    // Support passing a custom challenger
    if (options.Challenger) {
      // eslint-disable-next-line prefer-destructuring
      Challenger = options.Challenger;
    }

    app.setup = function newSetup(...args) {
      const result = _super.apply(this, args);
      const challenger = new Challenger(app, web3Settings);

      // Register 'web3' strategy with passport
      // debug('Registering web3 authentication strategy with options:', strategyOptions);
      debug('Registering web3 authentication strategy');
      // app.passport.use(web3Settings.name, new Web3Strategy(strategyOptions, verifier.verify.bind(verifier)));
      app.passport.use(web3Settings.name, new Web3Strategy(challenger));
      app.passport.options(web3Settings.name, web3Settings);

      return result;
    };
  };
}

module.exports = {
  web3,
  Web3Challenger,
};
