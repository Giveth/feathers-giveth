const logger = require('winston');
const { hexToNumberString } = require('web3-utils');
/**
 * class to keep feathers cache in sync with Vault payments
 */
class Payments {
  constructor(app, vault, eventQueue) {
    this.app = app;
    this.web3 = vault.$web3;
    this.vault = vault;
    this.queue = eventQueue;
  }

  async authorizePayment(event, isQueued = false) {
    if (event.event !== 'AuthorizePayment') {
      throw new Error('authorizePayment only handles AuthorizePayment events');
    }

    if (!isQueued && this.queue.isProcessing(event.transactionHash)) {
      this.queue.add(event.transactionHash, () => this.authorizePayment(event, true));
      return;
    }

    const { returnValues, transactionHash } = event;
    const paymentId = returnValues.idPayment;
    const pledgeId = hexToNumberString(returnValues.ref);
    const query = { pledgeId };

    const donations = this.app.service('donations');

    try {
      const data = await donations.find({ paginate: false, query });

      if (data.length === 0) {
        logger.error('AuthorizePayment: no donations found with pledgeId ->', pledgeId);
        return;
      }

      await donations.patch(null, { paymentId }, { query });

      if (isQueued) this.queue.purge(transactionHash);
    } catch (error) {
      logger.error('authorizePayment error ->', error);
    }
  }
}

module.exports = Payments;
