const { paymentStatus } = require('../../models/donations.model');

/**
 * convert liquidPledging `PledgeState` to human readable value
 *
 * @param {number} pledgeState value returned from liquidPledging.getPledge
 */
module.exports = pledgeState => {
  switch (pledgeState) {
    case '0':
      return paymentStatus.PLEDGED;
    case '1':
      return paymentStatus.PAYING;
    case '2':
      return paymentStatus.PAID;
    default:
      return 'Unknown';
  }
};
