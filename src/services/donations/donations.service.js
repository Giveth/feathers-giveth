// Initializes the `donations` service on path `/donations`
const createService = require('feathers-mongoose');
const createModel = require('../../models/donations.model');
const hooks = require('./donations.hooks');
const filters = require('./donations.filters');

// If a donation has a intendedProject & the commitTime has passed, we need to update the donation to reflect
// that the intendedProject is now the owner
const pollForCommittedDonations = service => {
  const interval = 1000 * 30; // check every 30 seconds

  const doUpdate = () => {
    service
      .find({
        paginate: false,
        query: {
          intendedProject: {
            $gt: '0',
          },
          commitTime: {
            $lte: new Date(),
          },
        },
      })
      .then(data => {
        data.forEach(donation =>
          service
            .patch(donation._id, {
              status: 'committed',
              owner: donation.intendedProject,
              ownerId: donation.intendedProjectId,
              ownerType: donation.intendedProjectType,
              $unset: {
                intendedProject: true,
                intendedProjectId: true,
                intendedProjectType: true,
                delegate: true,
                delegateId: true,
                delegateType: true,
              },
            })
            .catch(console.error),
        ); // eslint-disable-line no-console
      })
      .catch(console.error); // eslint-disable-line no-console
  };

  setInterval(doUpdate, interval);
};

module.exports = function() {
  const app = this;
  const Model = createModel(app);
  const paginate = app.get('paginate');

  const options = {
    name: 'donations',
    Model,
    paginate,
  };

  // Initialize our service with any options it requires
  app.use('/donations', createService(options));

  // Get our initialized service so that we can register hooks and filters
  const service = app.service('donations');

  pollForCommittedDonations(service);

  service.hooks(hooks);

  if (service.filter) {
    service.filter(filters);
  }
};
