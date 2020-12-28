const logger = require('winston');
const { hexToNumberString } = require('web3-utils');

/**
 * object factory to keep feathers cache in sync with LPVault payments contracts
 */
const payments = app => ({
  /**
   * handle `AuthorizePayment` events
   *
   * @param {object} event Web3 event object
   */
  async authorizePayment(event) {
    if (event.event !== 'AuthorizePayment') {
      throw new Error('authorizePayment only handles AuthorizePayment events');
    }

    const { returnValues } = event;
    const paymentId = returnValues.idPayment;
    const pledgeId = hexToNumberString(returnValues.ref);
    const query = { pledgeId };

    const donations = app.service('donations');

    try {
      const data = await donations.find({ paginate: false, query });

      if (data.length === 0) {
        logger.error('AuthorizePayment: no donations found with pledgeId ->', pledgeId);
        return;
      }

      await donations.patch(null, { paymentId }, { query });
    } catch (error) {
      logger.error('authorizePayment error ->', error);
    }
  },
});

module.exports = payments;
