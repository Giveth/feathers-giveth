// Initializes the `events` service on path `/events`
import createService from 'feathers-nedb';
import createModel from '../../models/events.model';
import hooks from './events.hooks';

export default function() {
  const app = this;
  const Model = createModel(app);
  const paginate = app.get('paginate');

  const options = {
    name: 'events',
    Model,
    paginate,
  };

  // Initialize our service with any options it requires
  app.use('/events', createService(options));

  // Get our initialized service so that we can register hooks and filters
  const service = app.service('events');

  service.hooks(hooks);
}
