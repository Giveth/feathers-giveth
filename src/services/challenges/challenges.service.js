// Initializes the `challenges` service on path `/authentication/challenges`
import { Service } from 'feathers-mongoose';
import errors from '@feathersjs/errors';

import { toChecksumAddress } from 'web3-utils';

import createModel from '../../models/challenges.model';
import hooks from './challenges.hooks';

// TODO clean this up and move to separate package feathers-authentication-web3

const validFor = 1000 * 60 * 5; // valid for 5 minutes
const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

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
      new: true
    };

    data.address = toChecksumAddress(data.address);
    data.expirationDate = new Date(Date.now() + validFor);
    data.message = this._randomMessage(20);

    // we call update here b/c we want to use upsert.
    return super.update(data.address, data, params).then(entity => entity.message);
  }

  find() {
    this._notImplemented('find');
  }

  update() {
    this._notImplemented('update');
  }

  patch() {
    this._notImplemented('patch');
  }

  _randomMessage(length) {
    let result = '';
    for (let i = length; i > 0; --i) result += chars[Math.floor(Math.random() * chars.length)];
    return result;
  }

  _notImplemented(method) {
    throw new errors.NotImplemented(`${method} is not implemented on this service`);
  }
}

export default function() {
  const app = this;
  const Model = createModel(app);
  const paginate = app.get('paginate');

  const options = {
    name: 'challenges',
    id: 'address',
    Model,
    paginate,
  };

  // Initialize our service with any options it requires
  app.use('/authentication/challenges', new ChallengeService(options));

  // Get our initialized service so that we can register hooks and filters
  const service = app.service('authentication/challenges');

  service.hooks(hooks);
}
