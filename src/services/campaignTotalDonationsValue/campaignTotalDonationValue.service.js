const { ObjectId } = require('mongoose').Types;
const { getTotalUsdValueDonatedToCampaign } = require('../../repositories/donationRepository');

module.exports = function totalUsdValueDonatedToCampaign() {
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
    securities: [],
    operations: {
      update: false,
      patch: false,
      remove: false,
      create: false,
      find: false,
      get: {
        description: 'Get total donation usdValue to a campaign',
        parameters: [
          {
            name: 'id',
            description: 'campaign ID',
            in: 'path',
          },
        ],
      },
    },
    definition: {
      type: 'object',
    },
  };
  app.use('/campaignTotalDonationValue', service);
};
