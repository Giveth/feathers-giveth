// Initializes the `transactions` service on path `/transactions`
import createService from 'feathers-mongoose';
import createModel from '../../models/transactions.model';
import hooks from './transactions.hooks';

export default function() {
  const app = this;
  const Model = createModel(app);
  const paginate = app.get('paginate');

  const options = {
    name: 'transactions',
    Model,
    paginate,
  };

  // Initialize our service with any options it requires
  app.use('/transactions', createService(options));

  // Get our initialized service so that we can register hooks and filters
  const service = app.service('transactions');

  service.hooks(hooks);
}
