const moment = require('moment');
const logger = require('winston');
const errors = require('@feathersjs/errors');
const { listOfDonorsToProjects } = require('../../repositories/donationRepository');
const {
  findVerifiedCommunities,
  findUnVerifiedCommunities,
} = require('../../repositories/communityRepository');
const {
  findVerifiedCampaigns,
  findUnVerifiedCampaigns,
} = require('../../repositories/campaignRepository');
const { findVerifiedTraces, findUnVerifiedTraces } = require('../../repositories/traceRepository');
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
  // If we throw exception we get error in UAT env, but in beta all donations have community, campaign or trace
  return {};
};

const getAllVerifiedProjectdIds = async app => {
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

const getAllUnVerifiedProjectdIds = async app => {
  const [traces, campaigns, communities] = await Promise.all([
    findUnVerifiedTraces(app),
    findUnVerifiedCampaigns(app),
    findUnVerifiedCommunities(app),
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
      const { fromDate, toDate, projectType } = query;
      if (!fromDate) {
        throw new errors.BadRequest('fromDate is required with this format: YYYY/MM/DD-hh:mm:ss');
      }
      if (!toDate) {
        throw new errors.BadRequest('toDate is required with this format: YYYY/MM/DD-hh:mm:ss');
      }
      let projectIds;
      if (projectType === 'verified') {
        projectIds = await getAllVerifiedProjectdIds(app);
      } else if (projectType === 'unVerified') {
        projectIds = await getAllUnVerifiedProjectdIds(app);
      }

      const from = moment(fromDate, 'YYYY/MM/DD-hh:mm:ss').toDate();
      const to = moment(toDate, 'YYYY/MM/DD-hh:mm:ss').toDate();

      const result = await listOfDonorsToProjects(app, {
        projectIds,
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
        data: result,
      };
    },
  };
  givbackReportDonations.docs = {
    operations: {
      find: {
        'parameters[3]': undefined,
        'parameters[0]': {
          description: 'YYYY/MM/DD-hh:mm:ss',
          default: '2021/07/01-00:00:00',
          name: 'fromDate',
          in: 'query',
        },
        'parameters[1]': {
          description: 'YYYY/MM/DD-hh:mm:ss',
          default: '2021/07/12-00:00:00',
          name: 'toDate',
          in: 'query',
        },
        'parameters[2]': {
          name: 'projectType',
          in: 'query',
          schema: {
            type: 'string',
            enum: ['verified', 'unVerified', 'all'],
          },
        },
      },
      update: false,
      patch: false,
      remove: false,
      get: false,
      create: false,
    },
    definition: {},
  };
  app.use('/verifiedProjectsGiversReport', givbackReportDonations);
};
