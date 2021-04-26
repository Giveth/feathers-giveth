const { AuthenticationBaseStrategy } = require('@feathersjs/authentication');
const { NotAuthenticated } = require('@feathersjs/errors');
const merge = require('lodash.merge');
const pick = require('lodash.pick');
const { isAddress, toChecksumAddress } = require('web3-utils');
const Debug = require('debug');

const debug = Debug('auth:Web3Strategy');
const Accounts = require('web3-eth-accounts');
const { Web3Challenger } = require('./Web3Challenger');

// TODO clean this up and split to separate package

function recoverAddress(message, signature) {
  const accounts = new Accounts();
  // const address = accounts.recover(accounts.hashMessage(message), signature);
  const address = accounts.recover(message, signature);

  return toChecksumAddress(address);
}
class Web3Strategy extends AuthenticationBaseStrategy {
  verifyConfiguration() {
    if (!this.configuration) {
      throw new Error(
        `Invalid Web3Strategy option 'authentication.${this.name}'. Did you mean to set it in 'authentication.web3'?`,
      );
    }
  }

  async authenticate(authentication) {
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
    } catch (err) {
      if (err.name === 'NotFound') return this.issueChallenge(address);
      throw new Error(err.message);
    }
    // issue a challenge if there is not a valid message
    if (!message) return this.issueChallenge(address);

    const recoveredAddress = recoverAddress(message, signature);
    const cAddress = toChecksumAddress(address);
    if (recoveredAddress !== cAddress)
      throw new Error('Recovered address does not match provided address');
    const { user, info } = await this.challenger.verify(cAddress);
    if (!user) throw new Error('Recovered address rejected');
    return { user, info };
  }

  // eslint-disable-next-line class-methods-use-this
  parse(req) {
    const { address, signature, strategy } = req.query;
    if (!strategy) {
      return null;
    }
    return {
      address,
      signature,
      strategy: 'web3',
    };
  }

  async issueChallenge(address) {
    return new Promise((resolve, reject) => {
      this.challenger.generateMessage(address, (err, message) => {
        if (err) return reject(new Error(`Error generating challenge: ${err}`));

        if (!message) return reject(new Error('Failed to generate challenge message'));

        return reject(new NotAuthenticated(`Challenge = ${message}`));
      });
    });
  }

  setChallenger() {
    if (this.challenger) {
      return;
    }
    const KEYS = [
      'secret',
      'header',
      'entity',
      'service',
      'passReqToCallback',
      'session',
      'jwtOptions',
    ];
    const authOptions = this.app.get('auth') || this.app.get('authentication') || {};
    const web3Options = authOptions[this.name] || {};
    web3Options.challengeService = 'authentication/challenges';

    // eslint-disable-next-line no-undef
    const web3Settings = merge({}, pick(authOptions, KEYS), web3Options);
    this.challenger = new Web3Challenger(this.app, web3Settings);
  }
}
exports.Web3Strategy = Web3Strategy;
