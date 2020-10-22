const BigNumber = require('bignumber.js');
const {
  getHourlyUSDCryptoConversion,
} = require('../../src/services/conversionRates/getConversionRatesService');
const { stableCoins, fiatWhitelist } = require('../../config/default.json');

// Used by scripts to set usdValue of donations
class DonationUsdValueUtility {
  constructor(conversionRateModel) {
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

    const config = {
      stableCoins,
      fiatWhitelist,
    };

    // Create app instance to pass getHourlyUSDCryptoConversion method
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

    const { rate } = await getHourlyUSDCryptoConversion(this.app, createdAt, symbol);
    const usdValue = Number(
      new BigNumber(amount.toString())
        .div(10 ** 18)
        .times(Number(rate))
        .toFixed(5),
    );
    donation.usdValue = usdValue;
  }
}

module.exports = DonationUsdValueUtility;
