// Initializes the `pledgeAdmins` service on path `/pledgeAdmins`
import createService from 'feathers-mongoose';
import createModel from '../../models/pledgeAdmins.model';
import hooks from './pledgeAdmins.hooks';

export default function() {
  const app = this;
  const Model = createModel(app);
  const paginate = app.get('paginate');

  const options = {
    name: 'pledgeAdmins',
    id: 'id',
    Model,
    paginate,
  };

  // Initialize our service with any options it requires
  app.use('/pledgeAdmins', createService(options));

  // Get our initialized service so that we can register hooks and filters
  const service = app.service('pledgeAdmins');

  service.hooks(hooks);
}
