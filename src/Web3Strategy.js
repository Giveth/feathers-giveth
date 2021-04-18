const { AuthenticationBaseStrategy } = require('@feathersjs/authentication');
const { NotAuthenticated } = require('@feathersjs/errors');
const { sign } = require('jsonwebtoken');
const merge = require('lodash.merge');
const omit = require('lodash.omit');
const pick = require('lodash.pick');
const supertest = require('supertest');
const { isAddress, toChecksumAddress } = require('web3-utils');
const Debug = require('debug');
const debug = Debug('passportjs:Web3Strategy');
const Accounts = require('web3-eth-accounts');

// TODO clean this up and split to separate package

function recoverAddress(message, signature) {
  const accounts = new Accounts();
  // const address = accounts.recover(accounts.hashMessage(message), signature);
  const address = accounts.recover(message, signature);

  return toChecksumAddress(address);
}
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
  
    async verify(address) {
      debug(`Fetching user for address: ${address}`);
      return new Promise((resolve, reject) => {
        const returnPayload = (entity, newUser) => {
          // try to remove the challenge for this user, ignoring any errors
          this.challengeService.remove(address).catch();
    
          const id = entity[this.service.id];
          const payload = { [`${this.options.entity}Id`]: id };
    
          if (newUser) {
            payload.newUser = true;
          }
    
          resolve({user: entity, info: payload});
        };
    
        return this.service
          .get(address)
          .then(user => returnPayload(user, !user.name)) // assuming this is a newUser if no name has been set
          .catch(err => {
            if (err.name === 'NotFound') {
              this.service
                .create({ address })
                .then(addr => returnPayload(addr, true))
                .catch(reject);
    
              return;
            }
            reject(err);
          });
      })
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

    async getMessageAsync(address) {
      debug(`Fetching challenge message for address: ${address}`);
  
      return this.challengeService
        .get(address)
        .then(message => {
          debug(`Found challenge message: ${message}`);
          return message;
        });
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

class Web3Strategy extends AuthenticationBaseStrategy {
    constructor() {
        super(...arguments);
    }
    verifyConfiguration() {
        if (!this.configuration) {
            throw new Error(`Invalid Web3Strategy option 'authentication.${this.name}'. Did you mean to set it in 'authentication.web3'?`);
        }
    }
    
    async authenticate(authentication, params) {
        this.setChallenger();
        const { address, signature } = authentication;

        if (!address) throw new NotAuthenticated();

        if (!isAddress(address)) {
        debug(`${address} is an invalid address`);
        throw new NotAuthenticated('invalid address');
        }
        // no signature, then they need a challenge msg to sign
        if (!signature) return this.issueChallenge(address);
        let message = null;
        try {
          message = await this.challenger.getMessageAsync(address);
        }
        catch(err) {
          if (err.name === 'NotFound') return this.issueChallenge(address);
          throw new Error(err.message);
        }

        // issue a challenge if there is not a valid message
        if (!message) return this.issueChallenge(address);

        const recoveredAddress = recoverAddress(message, signature);
        const cAddress = toChecksumAddress(address);

        if (recoveredAddress !== cAddress)
            throw new Error('Recovered address does not match provided address');
        const {user, info} = await this.challenger.verify(cAddress);
        if (!user) throw new Error('Recovered address rejected');
        return {user, info};
    }
    parse(req, res) {
      const { address, signature, strategy } = req.query;
      if (!strategy) {
        return null;
      }
        return {
            address,
            signature,
            strategy: 'web3'
        }
    }
    async issueChallenge(address) {
      return new Promise((resolve, reject) => {
        this.challenger.generateMessage(address, (err, message) => {
            if (err) return reject('Error generating challenge: ' + err);

            if (!message) return reject('Failed to generate challenge message');

            reject(new NotAuthenticated(`Challenge = ${message}`));
        });
      })
    }
    setChallenger() {
      if (this.challenger) {
        return;
      }
      const KEYS = ['secret', 'header', 'entity', 'service', 'passReqToCallback', 'session', 'jwt'];
        const authOptions = this.app.get('auth') || this.app.get('authentication') || {};
        const web3Options = authOptions[this.name] || {};
        web3Options.challengeService = 'authentication/challenges';

        const web3Settings = merge(
          {},
          defaults,
          pick(authOptions, KEYS),
          web3Options,
        );
        this.challenger = new Web3Challenger(this.app, web3Settings);
    }
}
exports.Web3Strategy = Web3Strategy;