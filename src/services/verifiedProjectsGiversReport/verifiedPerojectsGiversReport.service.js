const moment = require('moment');
const logger = require('winston');
const errors = require('@feathersjs/errors');
const { listOfDonorsToVerifiedProjects } = require('../../repositories/donationRepository');
const { findVerifiedCommunities } = require('../../repositories/communityRepository');
const { findVerifiedCampaigns } = require('../../repositories/campaignRepository');
const { findVerifiedTraces } = require('../../repositories/traceRepository');
const { getTokenByAddress } = require('../../utils/tokenHelper');
const { getTraceUrl, getCampaignUrl, getCommunityUrl } = require('../../utils/urlUtils');

const extractProjectInfo = donation => {
  const { campaign, trace, community } = donation;
  if (campaign.length === 1) {
    return {
      title: campaign[0].title,
      type: 'Campaign',
      url: getCampaignUrl(campaign[0]),
    };
  }
  if (trace.length === 1) {
    return {
      title: trace[0].title,
      type: 'Trace',
      url: getTraceUrl(trace[0]),
    };
  }
  if (community.length === 1) {
    return {
      title: community[0].title,
      type: 'Community',
      url: getCommunityUrl(community[0]),
    };
  }
  logger.error('donation should have trace, campaign or community', donation);
  // If we should throw exception we get error in UAT env, but in beta all donations have community, campaign or trace
  return {};
};

const getAllVerfiedProjectdIds = async app => {
  const [traces, campaigns, communities] = await Promise.all([
    findVerifiedTraces(app),
    findVerifiedCampaigns(app),
    findVerifiedCommunities(app),
  ]);
  return [
    ...traces.map(trace => trace.projectId),
    ...campaigns.map(campaign => campaign.projectId),
    ...communities.map(community => community.delegateId),
  ];
};

module.exports = function aggregateDonations() {
  const app = this;

  const givbackReportDonations = {
    async find({ query }) {
      const { fromDate, toDate, allProjects } = query;
      if (!fromDate) {
        throw new errors.BadRequest('fromDate is required with this format: YYYY/MM/DD-hh:mm:ss');
      }
      if (!toDate) {
        throw new errors.BadRequest('toDate is required with this format: YYYY/MM/DD-hh:mm:ss');
      }
      let verifiedProjectIds;
      if (!allProjects || allProjects === 'false') {
        verifiedProjectIds = await getAllVerfiedProjectdIds(app);
      }

      const from = moment(fromDate, 'YYYY/MM/DD-hh:mm:ss').toDate();
      const to = moment(toDate, 'YYYY/MM/DD-hh:mm:ss').toDate();

      const result = await listOfDonorsToVerifiedProjects(app, {
        verifiedProjectIds,
        from,
        to,
      });
      result.forEach(giverInfo => {
        giverInfo.donations.forEach(donation => {
          const token = getTokenByAddress(donation.tokenAddress);
          donation.amount = Number(donation.amount) / 10 ** 18;
          donation.token = token.symbol;

          // donations to communities may have both delegateId and ownerId but we should consider delegateId for them
          donation.projectId = donation.delegateId || donation.ownerId;

          donation.projectInfo = extractProjectInfo(donation);
          delete donation.delegateId;
          delete donation.ownerId;
          delete donation.campaign;
          delete donation.community;
          delete donation.trace;
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
