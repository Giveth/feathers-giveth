// Initializes the `donations` service on path `/donations`
import createService from 'feathers-nedb';
import createModel from '../../models/donationTokens.model';
import hooks from './donationTokens.hooks';
import filters from './donationTokens.filters';

export default function() {
  const app = this;
  const Model = createModel(app);
  const paginate = app.get('paginate');

  const options = {
    name: 'tokens',
    Model,
    paginate,
  };

  // Initialize our service with any options it requires
  app.use('/tokens', createService(options));

  // Get our initialized service so that we can register hooks and filters
  const service = app.service('tokens');

  service.hooks(hooks);

  if (service.filter) {
    service.filter(filters);
  }
}
