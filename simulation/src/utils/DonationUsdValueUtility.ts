const BigNumber = require('bignumber.js');
import {
  getHourlyCryptoConversion,
} from '../../../src/services/conversionRates/getConversionRatesService';
import { getTokenByAddress } from './tokenUtility';

// Used by scripts to set usdValue of donations
export class DonationUsdValueUtility {
  app;
  services;
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
    const { createdAt, tokenAddress, amount } = donation;

    try {
      const token = getTokenByAddress(tokenAddress);
      const { symbol } = token;
      const { rate } = await getHourlyCryptoConversion(this.app, createdAt, symbol, 'USD');
      const usdValue = Number(
        new BigNumber(amount.toString())
          .div(10 ** 18)
          .times(Number(rate))
          .toFixed(2),
      );
      donation.usdValue = usdValue;
      // eslint-disable-next-line no-empty
    } catch (e) {
      console.log('setDonationUsdValue error', {
        donation,
        tokenAddress,
        token: getTokenByAddress(tokenAddress),
      });
      throw e;
    }
  }
}

