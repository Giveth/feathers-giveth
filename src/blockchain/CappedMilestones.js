import logger from 'winston';

/**
 * class to keep feathers cache in sync with lpp-capped-milestones contract
 */
class CappedMilestones {
  constructor(app, web3) {
    this.app = app;
    this.web3 = web3;
    this.milestones = this.app.service('milestones');
  }

  milestoneAccepted(event) {
    if (event.event !== 'MilestoneAccepted')
      throw new Error('milestoneAccepted only handles MilestoneAccepted events');

    const { idProject } = event.returnValues;

    this.milestones
      .find({ query: { projectId: idProject } })
      .then(({ data }) => {
        // not interested in any milestones we aren't aware of.
        if (data.length === 0) return;

        const m = data[0];

        return this.milestones.patch(m._id, {
          status: 'Completed',
          mined: true,
        });
      })
      .catch(logger.error);
  }

  paymentCollected(event) {
    if (event.event !== 'PaymentCollected')
      throw new Error('paymentCollected only handles PaymentCollected events');

    const { idProject } = event.returnValues;

    this.milestones
      .find({ query: { projectId: idProject } })
      .then(({ data }) => {
        // not interested in any milestones we aren't aware of.
        if (data.length === 0) return;

        const m = data[0];

        return this.milestones.patch(m._id, {
          status: 'Paid',
          mined: true,
        });
      })
      .catch(logger.error);
  }
}

export default CappedMilestones;
