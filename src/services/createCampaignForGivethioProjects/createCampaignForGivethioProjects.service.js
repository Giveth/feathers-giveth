const errors = require('@feathersjs/errors');
const config = require('config');
const logger = require('winston');
const { getProjectInfoBySLug } = require('../../utils/givethIoUtils');
const { findCampaignByGivethIoProjectId } = require('../../repositories/campaignRepository');

module.exports = function aggregateDonations() {
  const app = this;

  const service = {
    async create(data, params) {
      const { txHash, image, slug } = data;

      // TODO should remove below line
      const { projectId } = data;
      const projectInfo = await getProjectInfoBySLug(slug);
      const {
        id: givethIoProjectId,
        title,
        description,
        walletAddress: ownerAddress,
      } = projectInfo;
      // TODO uncomment below lines
      // if (params.user.address !== ownerAddress){
      //   throw new errors.Forbidden('The owner of project in givethIo is not you');
      // }
      // let campaign = await findCampaignByGivethIoProjectId(app, projectInfo.id);
      let campaign = await findCampaignByGivethIoProjectId(app, projectId);
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
        // TODO uncomment below lines
        // ownerAddress,
        // givethIoProjectId,
        givethIoProjectId: data.projectId,
        ownerAddress: '0x5AC583Feb2b1f288C0A51d6Cdca2e8c814BFE93B',
      });
      return campaign;
    },
    async find({ query }) {
      const { slug, userAddress } = query;
      const projectInfo = await getProjectInfoBySLug(slug);
      const { id: givethIoProjectId, walletAddress: ownerAddress } = projectInfo;
      if (ownerAddress !== userAddress) {
        logger.error('The owner of givethIo project is ', ownerAddress);
        throw new errors.Forbidden('The owner of project in givethIo is not you');
      }
      // TODO uncomment below lines
      const campaign = await findCampaignByGivethIoProjectId(app, givethIoProjectId);
      if (campaign) {
        throw new errors.BadRequest('Campaign with this givethIo projectId exists');
      }
      return projectInfo;
    },
  };
  service.docs = {
    // TODO uncomment below lines
    // securities: ['create'],
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
