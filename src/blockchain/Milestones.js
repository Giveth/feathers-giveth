import LPPMilestone from 'lpp-milestone';

import { milestoneStatus } from './helpers';

/**
 * class to keep feathers cache in sync with lpp-milestone contracts
 */
class Milestones {
  constructor(app, web3) {
    this.app = app;
    this.web3 = web3;
    this.contract = new LPPMilestone(this.web3).$contract;
    this.milestoneAcceptedEvent = this.contract._jsonInterface.find(d => d.type === 'event' && d.name === 'MilestoneAccepted');
    this.milestones = this.app.service('milestones');
  }

  milestoneAccepted(event) {
    console.log('handling milestone Event: ', event); // eslint-disable-line no-console

    this.milestones.find({ query: { pluginAddress: event.address } })
      .then(({ data }) => {
        // not interested in any milestones we aren't aware of. Could be a false positive in the bloomFilter
        if (data.length === 0) return;

        const m = data[ 0 ];

        return this.milestones.patch(m._id, {
          status: 'Completed',
          mined: true,
        });
      })
      .catch(console.error); // eslint-disable-line no-console
  }
}

export default Milestones;
