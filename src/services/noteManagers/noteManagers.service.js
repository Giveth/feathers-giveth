// Initializes the `pledgeManagers` service on path `/pledgeManagers`
import createService from 'feathers-nedb';
import createModel from '../../models/pledgeManagers.model';
import hooks from './pledgeManagers.hooks';
import filters from './pledgeManagers.filters';

export default function () {
  const app = this;
  const Model = createModel(app);
  const paginate = app.get('paginate');

  const options = {
    name: 'pledgeManagers',
    id: 'id',
    Model,
    paginate
  };

  // Initialize our service with any options it requires
  app.use('/pledgeManagers', createService(options));

  // Get our initialized service so that we can register hooks and filters
  const service = app.service('pledgeManagers');

  service.hooks(hooks);

  if (service.filter) {
    service.filter(filters);
  }
};
