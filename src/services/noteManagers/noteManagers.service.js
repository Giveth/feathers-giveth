// Initializes the `noteManagers` service on path `/noteManagers`
import createService from 'feathers-nedb';
import createModel from '../../models/noteManagers.model';
import hooks from './noteManagers.hooks';
import filters from './noteManagers.filters';

export default function () {
  const app = this;
  const Model = createModel(app);
  const paginate = app.get('paginate');

  const options = {
    name: 'noteManagers',
    id: 'id',
    Model,
    paginate
  };

  // Initialize our service with any options it requires
  app.use('/noteManagers', createService(options));

  // Get our initialized service so that we can register hooks and filters
  const service = app.service('noteManagers');

  service.hooks(hooks);

  if (service.filter) {
    service.filter(filters);
  }
};
