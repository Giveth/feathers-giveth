const { ObjectId } = require('mongoose').Types;
const { getTotalUsdValueDonatedToCampaign } = require('../../repositories/donationRepository');

module.exports = function verifiedCampaigns() {
  const app = this;

  const service = {
    async get(id) {
      if (!id || !ObjectId.isValid(id)) {
        return { error: 400 };
      }
      const totalUsdValue = await getTotalUsdValueDonatedToCampaign(app, { campaignId: id });
      return {
        totalUsdValue,
      };
    },
  };

  service.docs = {
    securities: ['get'],
    operations: {
      update: false,
      patch: false,
      remove: false,
      create: false,
      find: {
        description: 'Get total donation usdValue to a campaign',
        parameters: [],
      },
    },
    definition: {
      type: 'object',
    },
  };
  app.use('/campaignTotalDonationValue', service);
};
