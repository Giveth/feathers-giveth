const moment = require('moment');
const errors = require('@feathersjs/errors');
const { listOfUserDonorsOnVerifiedProjects } = require('../../repositories/donationRepository');
const { findVerifiedCommunities } = require('../../repositories/communityRepository');
const { findVerifiedCampaigns } = require('../../repositories/campaignRepository');
const { findVerifiedTraces } = require('../../repositories/traceRepository');

module.exports = function aggregateDonations() {
  const app = this;

  const givbackReportDonations = {
    async find({ query }) {
      const { fromDate, toDate } = query;
      if (!fromDate) {
        throw new errors.BadRequest('fromDate is required with this format: YYYY/MM/DD-hh:mm:ss');
      }
      if (!toDate) {
        throw new errors.BadRequest('toDate is required with this format: YYYY/MM/DD-hh:mm:ss');
      }
      const [traces, campaigns, communities] = await Promise.all([
        findVerifiedTraces(app),
        findVerifiedCampaigns(app),
        findVerifiedCommunities(app),
      ]);
      const verifiedProjectIds = traces
        .map(trace => trace.projectId)
        .concat(campaigns.map(campaign => campaign.projectId))
        .concat(communities.map(community => community.delegateId));

      const from = moment(fromDate, 'YYYY/MM/DD-hh:mm:ss').toDate();
      const to = moment(toDate, 'YYYY/MM/DD-hh:mm:ss').toDate();

      const result = await listOfUserDonorsOnVerifiedProjects(app, {
        verifiedProjectIds,
        from,
        to,
      });
      result.forEach(giverInfo => {
        giverInfo.donations.forEach(donation => {
          // donations to communities may have both delegateId and ownerId but we should consider delegateId for them
          donation.projectId = donation.delegateId || donation.ownerId;
          delete donation.delegateId;
          delete donation.ownerId;
          donation.amount = Number(donation.amount) / 10 ** 18;
        });
      });
      return {
        total: result.length,
        from,
        to,
        verifiedProjectIds,
        data: result,
      };
    },
  };
  app.use('/verifiedProjectsGiversReport', givbackReportDonations);
};
