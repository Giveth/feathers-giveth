/* eslint-disable no-param-reassign */
/* eslint-disable class-methods-use-this */

// Initializes the `challenges` service on path `/authentication/challenges`
const { Service } = require('feathers-mongoose');
const errors = require('@feathersjs/errors');

const { toChecksumAddress } = require('web3-utils');

const createModel = require('../../models/challenges.model');
const hooks = require('./challenges.hooks');

// TODO clean this up and move to separate package feathers-authentication-web3

const validFor = 1000 * 60 * 5; // valid for 5 minutes
const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

const randomMessage = length => {
  let result = '';
  for (let i = length; i > 0; i -= 1) result += chars[Math.floor(Math.random() * chars.length)];
  return result;
};

const notImplemented = method => {
  throw new errors.NotImplemented(`${method} is not implemented on this service`);
};

class ChallengeService extends Service {
  get(address, params) {
    return super.get(toChecksumAddress(address), params).then(entity => {
      if (entity.expirationDate <= new Date()) {
        throw new errors.NotFound(`No challenge message found for address ${address}`);
      }

      return entity.message;
    });
  }

  create(data, params) {
    if (!data.address) throw new errors.BadRequest('address is required');
    params.mongoose = {
      upsert: true,
      new: true,
    };

    data.address = toChecksumAddress(data.address);
    data.expirationDate = new Date(Date.now() + validFor);
    data.message = randomMessage(20);

    // we call update here b/c we want to use upsert.
    return super.update(data.address, data, params).then(entity => entity.message);
  }

  find() {
    notImplemented('find');
  }

  update() {
    notImplemented('update');
  }

  patch() {
    notImplemented('patch');
  }
}

module.exports = function factory() {
  const app = this;
  const Model = createModel(app);
  const paginate = app.get('paginate');

  const options = {
    name: 'challenges',
    id: 'address',
    Model,
    paginate,
  };

  const service = new ChallengeService(options);
  service.docs = {
    operations: {
      find: false,
      update: false,
      patch: false,
      remove: false,
      get: false,
      create: {
        description:
          'Create a message then sign it with metamask to get accessToken (with websocket)' +
          'but Currently I dont know how exactly should use this endpoint',
      },
    },
    definition: {
      type: 'object',
      properties: {
        address: {
          type: 'string',
        },
      },
    },
  };
  // Initialize our service with any options it requires
  app.use('/authentication/challenges', service);

  // Get our initialized service so that we can register hooks and filters
  app.service('authentication/challenges').hooks(hooks);
};
