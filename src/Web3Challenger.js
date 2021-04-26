const Debug = require('debug');

const debug = Debug('auth:Web3Challenger');

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

        resolve({ user: entity, info: payload });
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

  async getMessageAsync(address) {
    debug(`Fetching challenge message for address: ${address}`);

    return this.challengeService.get(address).then(message => {
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

module.exports = { Web3Challenger };
