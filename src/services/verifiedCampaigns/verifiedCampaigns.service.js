const errors = require('@feathersjs/errors');
const config = require('config');
const logger = require('winston');
const { findCampaignByGivethIoProjectId } = require('../../repositories/campaignRepository');
const { getGivethIoAdapter } = require('../../adapters/adapterFactory');

const convertGivethIoToTraceImage = image => {
  const imageIpfsPath = image.match(/\/ipfs\/.*/);
  return imageIpfsPath ? imageIpfsPath[0] : image;
};

const givethIoAdapter = getGivethIoAdapter();
module.exports = function verifiedCampaigns() {
  const app = this;

  const service = {
    async create(data, params) {
      const { txHash, url, slug } = data;
      const projectInfo = await givethIoAdapter.getProjectInfoBySLug(slug);
      const { id: givethIoProjectId, title, description, image } = projectInfo;
      const owner = await givethIoAdapter.getUserByUserId(projectInfo.admin);
      if (params.user.address.toLowerCase() !== owner.address.toLowerCase()) {
        throw new errors.Forbidden('The owner of project in givethIo is not you');
      }
      let campaign = await findCampaignByGivethIoProjectId(app, givethIoProjectId);
      if (campaign) {
        throw new errors.BadRequest('Campaign with this givethIo projectId exists');
      }
      campaign = await app.service('campaigns').create({
        title,
        url,
        slug,
        reviewerAddress: config.givethIoProjectsReviewerAddress,
        description,
        verified: true,
        txHash,
        image: convertGivethIoToTraceImage(image),
        ownerAddress: owner.address,
        givethIoProjectId,
      });
      return campaign;
    },

    async find({ query }) {
      const { slug, userAddress } = query;
      const projectInfo = await givethIoAdapter.getProjectInfoBySLug(slug);
      const { id: givethIoProjectId } = projectInfo;
      const owner = await givethIoAdapter.getUserByUserId(projectInfo.admin);

      if (owner.address !== userAddress) {
        logger.error('The owner of givethIo project is ', owner.address);
        throw new errors.Forbidden('The owner of project in givethIo is not you');
      }
      const campaign = await findCampaignByGivethIoProjectId(app, givethIoProjectId);
      if (campaign) {
        throw new errors.BadRequest('Campaign with this givethIo projectId exists');
      }
      return { ...projectInfo, owner, reviewerAddress: config.givethIoProjectsReviewerAddress };
    },
  };

  service.docs = {
    securities: ['create', 'update'],
    operations: {
      update: false,
      patch: false,
      remove: false,
      find: {
        description: 'Check if user can create campaign base on givethIo project',
        parameters: [
          {
            type: 'string',
            in: 'query',
            description: 'The slug of project in givethIo',
            default: 'testing-another-project',
            name: 'slug',
          },
          {
            type: 'string',
            in: 'query',
            default: '0x826976d7c600d45fb8287ca1d7c76fc8eb732030',
            name: 'userAddress',
          },
        ],
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
        url: {
          description: 'ipfs url for project',
          type: 'string',
        },
      },
    },
  };
  app.use('/verifiedCampaigns', service);
};
