// Initializes the `donationsHistory` service on path `/donations/:id/history`
import { Service } from 'feathers-nedb';
import errors from 'feathers-errors';
import createModel from '../../models/donationsHistory.model';
import hooks from './donationsHistory.hooks';
import filters from './donationsHistory.filters';

class DonationsHistoryService extends Service {

  create(data, params) {
    data.donationId = params.donationId;
    return super.create(data, params);
  }

  find(query, params) {
    query.donationId = params.donationId;
    return super.find(query, params);
  }

  update() {
    this._notImplemented('update');
  }

  patch() {
    this._notImplemented('patch');
  }

  remove() {
    this._notImplemented('remove');
  }

  _notImplemented(method) {
    throw new errors.NotImplemented(`${method} is not implemented on this service`);
  }
}


export default function () {
  const app = this;
  const Model = createModel(app);
  const paginate = app.get('paginate');

  const options = {
    name: 'donationsHistory',
    Model,
    paginate,
  };

  // Initialize our service with any options it requires
  app.use('/donations/:donationId/history', new DonationsHistoryService(options));

  // Get our initialized service so that we can register hooks and filters
  const service = app.service('donations/:donationId/history');

  service.hooks(hooks);

  if (service.filter) {
    service.filter(filters);
  }
};

