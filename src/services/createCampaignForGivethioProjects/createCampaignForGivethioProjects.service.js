const errors = require('@feathersjs/errors');
const config = require('config');
const logger = require('winston');
const { findCampaignByGivethIoProjectId } = require('../../repositories/campaignRepository');
const { getGivethIoAdapter } = require('../../adapters/adapterFactory');

const givethIoAdapter = getGivethIoAdapter();
module.exports = function aggregateDonations() {
  const app = this;

  const service = {
    async create(data, params) {
      const { txHash, image, slug } = data;

      const projectInfo = await givethIoAdapter.getProjectInfoBySLug(slug);
      const {
        id: givethIoProjectId,
        title,
        description,
        walletAddress: ownerAddress,
      } = projectInfo;
      if (params.user.address !== ownerAddress) {
        throw new errors.Forbidden('The owner of project in givethIo is not you');
      }
      let campaign = await findCampaignByGivethIoProjectId(app, givethIoProjectId);
      if (campaign) {
        throw new errors.BadRequest('Campaign with this givethIo projectId exists');
      }
      campaign = await app.service('campaigns').create({
        title,
        slug,
        reviewerAddress: config.givethIoProjectsReviewerAddress,
        description,
        txHash,
        image,
        ownerAddress,
        givethIoProjectId,
      });
      return campaign;
    },
    async find({ query }) {
      const { slug, userAddress } = query;
      const projectInfo = await givethIoAdapter.getProjectInfoBySLug(slug);
      const { id: givethIoProjectId, walletAddress: ownerAddress } = projectInfo;
      if (ownerAddress !== userAddress) {
        logger.error('The owner of givethIo project is ', ownerAddress);
        throw new errors.Forbidden('The owner of project in givethIo is not you');
      }
      const campaign = await findCampaignByGivethIoProjectId(app, givethIoProjectId);
      if (campaign) {
        throw new errors.BadRequest('Campaign with this givethIo projectId exists');
      }
      return projectInfo;
    },
  };
  service.docs = {
    securities: ['create'],
    operations: {
      update: false,
      patch: false,
      remove: false,
      find: {
        description: 'Check if user can create campaign base on givethIo project',
        'parameters[0]': {
          type: 'string',
          in: 'query',
          description: 'The slug of project in givethIo',
          name: 'slug',
        },
        'parameters[1]': {
          type: 'string',
          in: 'query',
          name: 'userAddress',
        },

        // removing extra fields from query that swagger automatically ($sort)
        'parameters[2]': undefined,
      },
      create: {
        description: 'Create campaign base on givethIo project',
      },
    },
    definition: {
      type: 'object',
      properties: {
        slug: {
          type: 'string',
        },
        txHash: {
          type: 'string',
        },
        image: {
          type: 'string',
        },
      },
    },
  };
  app.use('/createCampaignForGivethioProjects', service);
};
