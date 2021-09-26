const { NotFound } = require('@feathersjs/errors');
const { findCampaignBySlug } = require('../../repositories/campaignRepository');
const { CampaignStatus } = require('../../models/campaigns.model');
const hooks = require('./verifyCampaigns.hooks');

module.exports = function verifiedCampaigns() {
  const app = this;

  const service = {
    async create(data) {
      const { slug, verified, archived } = data;
      const campaign = await findCampaignBySlug(app, slug);
      if (!campaign) {
        throw new NotFound();
      }
      const updateData = {};
      if (verified !== undefined) {
        updateData.verified = Boolean(verified);
      }
      if (archived === true && campaign.status === CampaignStatus.ACTIVE) {
        updateData.status = CampaignStatus.ARCHIVED;
      } else if (archived === false && campaign.status === CampaignStatus.ARCHIVED) {
        updateData.status = CampaignStatus.ACTIVE;
      }
      const result = await app.service('campaigns').patch(campaign.id, updateData);
      return result;
    },
  };

  service.docs = {
    securities: ['create'],
    operations: {
      update: false,
      patch: false,
      remove: false,
      find: false,
      create: {
        description: 'Verify and archive campaign',
      },
    },
    definition: {
      type: 'object',
      properties: {
        slug: {
          type: 'string',
        },
        verified: {
          type: 'boolean',
        },
        archived: {
          type: 'boolean',
        },
      },
    },
  };
  app.use('/verifyCampaigns', service);
  app.service('verifyCampaigns').hooks(hooks);
};
