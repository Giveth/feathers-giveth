import LPPCampaign from 'lpp-campaign';

import { campaignStatus } from './helpers';

/**
 * class to keep feathers cache in sync with lpp-campaign contracts
 */
class Campaigns {
  constructor(app, web3) {
    this.app = app;
    this.web3 = web3;
    this.contract = new LPPCampaign(this.web3).$contract;
    this.campaignCanceledEvent = this.contract._jsonInterface.find(d => d.type === 'event' && d.name === 'CampaignCanceled');
    this.campaigns = this.app.service('campaigns');
  }

  campaignCanceled(event) {
    const decodedEvent = this.contract._decodeEventABI.bind(this.campaignCanceledEvent)(event);
    console.log('handling campaign Event: ', decodedEvent);

    this.campaigns.find({ query: { pluginAddress: decodedEvent.address } })
      .then(({ data }) => {
        // not interested in any campaigns we aren't aware of. Could be a false positive in the bloomFilter
        if (data.length === 0) return;

        const c = data[ 0 ];

        return this.campaigns.patch(c._id, {
          status: campaignStatus(decodedEvent.returnValues.status)
        });
      })
      .catch(console.error); // eslint-disable-line no-console
  }
}

export default Campaigns;
