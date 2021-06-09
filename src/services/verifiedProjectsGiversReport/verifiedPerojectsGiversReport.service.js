const moment = require('moment');
const errors = require('@feathersjs/errors');
const { listOfUserDonorsOnVerifiedProjects } = require('../../repositories/donationRepository');

module.exports = function aggregateDonations() {
  const app = this;

  const givbackReportDonations = {
    async find({ query }) {
      const { fromDate, toDate, projectIds } = query;
      if (!projectIds) {
        throw new errors.BadRequest('projectIds are required');
      }
      if (!fromDate) {
        throw new errors.BadRequest('fromDate is required with this format: YYYY/MM/DD-hh:mm:ss');
      }
      if (!toDate) {
        throw new errors.BadRequest('toDate is required with this format: YYYY/MM/DD-hh:mm:ss');
      }
      if (!projectIds) {
        throw new errors.BadRequest('projectIds are required');
      }
      const from = moment(fromDate, 'YYYY/MM/DD-hh:mm:ss').toDate();
      const to = moment(toDate, 'YYYY/MM/DD-hh:mm:ss').toDate();

      const result = await listOfUserDonorsOnVerifiedProjects(app, {
        projectIds: projectIds.split(',').map(projectId => Number(projectId)),
        from,
        to,
      });

      return {
        total: result.length,
        from,
        to,
        data: result,
      };
    },
  };
  app.use('/verifiedProjectsGiversReport', givbackReportDonations);
};
