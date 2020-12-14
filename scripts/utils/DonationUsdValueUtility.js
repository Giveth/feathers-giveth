const BigNumber = require('bignumber.js');
const {
  getHourlyCryptoConversion,
} = require('../../src/services/conversionRates/getConversionRatesService');

// Used by scripts to set usdValue of donations
class DonationUsdValueUtility {
  constructor(conversionRateModel, config) {
    this.services = {};

    const createServiceFromModel = (name, Model) => {
      this.services[name] = {
        find: async ({ query }) => {
          const data = await Model.find(query).exec();
          return { data };
        },

        create: obj => Model.create(obj),

        patch: async (id, patchObj) => {
          const [object] = await Model.find({ id }).exec();
          Object.keys(patchObj).forEach(key => {
            object[key] = patchObj[key];
          });
          return object.save();
        },
      };
    };

    createServiceFromModel('conversionRates', conversionRateModel);

    // Create app instance to pass getHourlyCryptoConversion method
    this.app = {
      get: key => config[key],
      service: serviceName => {
        return this.services[serviceName];
      },
    };
  }

  async setDonationUsdValue(donation) {
    const { createdAt, token, amount } = donation;
    const { symbol } = token;

    try {
      const { rate } = await getHourlyCryptoConversion(this.app, createdAt, symbol, 'USD');
      const usdValue = Number(
        new BigNumber(amount.toString())
          .div(10 ** 18)
          .times(Number(rate))
          .toFixed(2),
      );
      donation.usdValue = usdValue;
      // eslint-disable-next-line no-empty
    } catch (e) {}
  }
}

module.exports = DonationUsdValueUtility;
