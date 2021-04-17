const logger = require('winston');
const { hexToNumberString } = require('web3-utils');
const BigNumber = require('bignumber.js');

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
        return null;
      }

      const donation = await donations.patch(null, { paymentId }, { query });
      return donation;
    } catch (error) {
      logger.error('authorizePayment error ->', error);
      return null;
    }
  },

  /**
   * handle `PaymentAuthorized` events
   *
   * @param {object} event Web3 event object
   */
  async paymentAuthorized(event) {
    if (event.event !== 'PaymentAuthorized') {
      throw new Error('paymentAuthorized only handles PaymentAuthorized events');
    }

    const { transactionHash, returnValues, blockNumber } = event;
    const service = app.service('homePaymentsTransactions');

    const result = await service.find({
      query: { hash: transactionHash, event: 'PaymentAuthorized', $limit: 0 },
    });

    if (result.total !== 0) {
      logger.error('Attempt to process PaymentAuthorized event that has already processed', event);
      return;
    }

    const { idPayment, recipient, amount, token: tokenAddress, reference } = returnValues;

    const web3 = await app.getHomeWeb3();
    const donationModel = app.service('donations').Model;
    const milestoneModel = app.service('milestones').Model;

    const [block, transaction, transactionReceipt, donation] = await Promise.all([
      web3.eth.getBlock(blockNumber),
      web3.eth.getTransaction(transactionHash),
      web3.eth.getTransactionReceipt(transactionHash),
      donationModel.findOne({ txHash: reference }, ['ownerTypeId']),
    ]);

    if (!donation) {
      logger.error('No donation found with reference', reference);
      throw new Error(`No donation found with reference: ${reference}`);
    }

    const { ownerTypeId: milestoneId } = donation;

    const { campaignId } = await milestoneModel.findById(milestoneId, ['campaignId']);

    const { timestamp } = block;
    const { gasPrice } = transaction;
    const { from, gasUsed } = transactionReceipt;

    const conversionRate = await app
      .service('conversionRates')
      .find({ query: { date: timestamp * 1000, symbol: 'ETH', to: 'USD' } });

    const rate = conversionRate.rates.USD;
    const usdValue = new BigNumber(gasUsed)
      .times(web3.utils.fromWei(gasPrice))
      .times(rate)
      .toFixed(2);

    const tokenNormalizedAddress =
      tokenAddress === '0x0000000000000000000000000000000000000000'
        ? '0x0'
        : tokenAddress.toLowerCase();
    const token = app
      .get('tokenWhitelist')
      .find(t => t.address.toLowerCase() === tokenNormalizedAddress);

    if (!token) {
      logger.error('No token found for address:', tokenAddress);
      throw new Error(`No token found for address: ${tokenAddress}`);
    }

    await service.create({
      hash: transactionHash,
      event: event.event,
      usdValue,
      recipientAddress: recipient,
      milestoneId,
      campaignId,
      gasUsed,
      timestamp,
      from,
      payments: [{ amount, symbol: token.symbol }],
      paidByGiveth: true,
      paymentId: idPayment,
    });
  },
});

module.exports = payments;
