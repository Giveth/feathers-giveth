// Initializes the `donations` service on path `/donations`
const createService = require('feathers-nedb');
const createModel = require('../../models/donations.model');
const hooks = require('./donations.hooks');
const filters = require('./donations.filters');

// If a donation has a proposedProject & the commitTime has passed, we need to update the donation to reflect
// that the proposedProject is now the owner
const pollForCommittedDonations = (service) => {
  const interval = 1000 * 30; // check every 30 seconds

  const doUpdate = () => {

    service.find({
      query: {
        proposedProject: {
          $gt: '0',
        },
        commitTime: {
          $lte: new Date(),
        },
        $limit: 5000,
      },
    })
      .then(({ data }) => {
        data.forEach(donation => service.patch(donation._id, {
          status: 'committed',
          owner: donation.proposedProject,
          ownerId: donation.proposedProjectId,
          ownerType: donation.proposedProjectType,
          $unset: {
            proposedProject: true,
            proposedProjectId: true,
            proposedProjectType: true,
            delegate: true,
            delegateId: true,
            delegateType: true,
          }
        })
          .catch(console.error)); //eslint-disable-line no-console
      })
      .catch(console.error); //eslint-disable-line no-console
  };

  setInterval(doUpdate, interval);
};

module.exports = function () {
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
