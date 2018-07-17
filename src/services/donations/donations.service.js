// Initializes the `donations` service on path `/donations`
const createService = require('feathers-mongoose');
const logger = require('winston');
const { DonationStatus, createModel } = require('../../models/donations.model');
const hooks = require('./donations.hooks');

// If a donation has a intendedProject & the commitTime has passed, we need to update the donation to reflect
// that the intendedProject is now the owner
const pollForCommittedDonations = service => {
  const interval = 1000 * 30; // check every 30 seconds

  const doUpdate = async () => {
    try {
      const donations = await service.find({
        paginate: false,
        query: {
          status: DonationStatus.TO_APPROVE,
          intendedProjectId: {
            $gt: 0,
          },
          commitTime: {
            $lte: new Date(),
          },
        },
      });

      donations.forEach(async donation => {
        try {
          await service.patch(donation._id, {
            status: DonationStatus.COMMITTED,
            amountRemaining: '0',
          });

          const keysToPick = [
            'giverAddress',
            'amount',
            'amountRemaining',
            'pledgeId', // we use this b/c lp will normalize the pledge before transferring
            'commitTime',
            'previousState',
          ];
          const newDonation = Object.keys(donation)
            .filter(k => keysToPick.includes(k))
            .reduce((accumulator, key) => {
              // eslint-disable-next-line no-param-reassign
              accumulator[key] = donation[key];
              return accumulator;
            }, {});
          Object.assign(newDonation, {
            ownerId: donation.intendedProjectId,
            ownerType: donation.intendedProjectType,
            ownerTypeId: donation.intendedProjectTypeId,
            status: DonationStatus.COMMITTED,
            parentDonations: [donation._id],
          });
          service.create(newDonation);
        } catch (err) {
          logger.error(err);
        }
      });
    } catch (err) {
      logger.error(err);
    }
  };

  setInterval(doUpdate, interval);
};

module.exports = function serviceFactory() {
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
};
