const logger = require('winston');
const { hexToNumberString } = require('web3-utils');
const BigNumber = require('bignumber.js');
const { getTokenByAddress } = require('../utils/tokenHelper');
const { getTransaction } = require('./lib/web3Helpers');
const { moneyWentToRecipientWallet } = require('../utils/dappMailer');
const { createPayoutConversation } = require('../utils/conversationCreator');

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

    const { transactionHash, returnValues } = event;

    const service = app.service('homePaymentsTransactions');

    const result = await service.Model.countDocuments({
      hash: transactionHash,
      event: 'PaymentAuthorized',
    });

    if (result !== 0) {
      logger.error('Attempt to process PaymentAuthorized event that has already processed', {
        result,
        event,
      });
      return;
    }

    const { idPayment, recipient, amount, token: tokenAddress, reference:donationTxHash } = returnValues;

    const donationModel = app.service('donations').Model;
    const milestoneModel = app.service('milestones').Model;

    const [{ timestamp, gasPrice, gasUsed, from }, donation] = await Promise.all([
      getTransaction(app, transactionHash, true, true),
      donationModel.findOne({ txHash: donationTxHash }, ['ownerTypeId']),
    ]);

    if (!donation) {
      throw new Error(`No donation found with reference: ${donationTxHash}`);
    }

    const { ownerTypeId: milestoneId } = donation;

    const { campaignId } = await milestoneModel.findById(milestoneId, ['campaignId']);

    const conversionRate = await app
      .service('conversionRates')
      .find({ query: { date: timestamp * 1000, symbol: 'ETH', to: 'USD' } });

    const rate = conversionRate.rates.USD;
    const transactionFee = new BigNumber(gasUsed).times(gasPrice);
    const usdValue = transactionFee
      .div(10 ** 18)
      .times(rate)
      .toFixed(2);

    const tokenNormalizedAddress =
      tokenAddress === '0x0000000000000000000000000000000000000000'
        ? '0x0'
        : tokenAddress.toLowerCase();

    const token = getTokenByAddress(tokenNormalizedAddress);

    if (!token) {
      throw new Error(`No token found for address: ${tokenAddress}`);
    }

    await service.create({
      hash: transactionHash,
      event: event.event,
      usdValue,
      recipientAddress: recipient,
      milestoneId,
      campaignId,
      donationTxHash,
      transactionFee,
      timestamp,
      from,
      payments: [{ amount, symbol: token.symbol }],
      paidByGiveth: true,
      paymentId: idPayment,
    });
  },

  /**
   * handle `PaymentExecuted` events
   *
   * @param {object} event Web3 event object
   */
  async paymentExecuted(event) {
    if (event.event !== 'PaymentExecuted') {
      throw new Error('paymentExecuted only handles PaymentExecuted events');
    }
    const { transactionHash, returnValues } = event;
    const tx = await getTransaction(app, transactionHash, true, true);
    const { timestamp, gasPrice, gasUsed, from } = tx;

    const givethAccounts = app.get('givethAccounts');

    // If gas is not paid by Giveth we can skip
    if (!givethAccounts.includes(from)) {
      logger.error('The from of transaction is not a giveth account', {
        from,
        givethAccounts,
      });
      return;
    }

    const { idPayment, recipient, amount, token: tokenAddress } = returnValues;

    const service = app.service('homePaymentsTransactions');

    const result = await service.Model.countDocuments({
      hash: transactionHash,
      event: 'PaymentExecuted',
      paymentId: idPayment,
    });

    if (result !== 0) {
      logger.error('Attempt to process PaymentExecuted event that has already processed', {
        event,
      });
      return;
    }

    const [
      paymentAuthorizedTransaction,
      numberOfPaymentsExecutedInTx,
      conversionRate,
    ] = await Promise.all([
      service.Model.findOne({
        event: 'PaymentAuthorized',
        paymentId: idPayment,
      }),
      app.service('events').Model.countDocuments({ event: 'PaymentExecuted', transactionHash }),
      app
        .service('conversionRates')
        .find({ query: { date: timestamp * 1000, symbol: 'ETH', to: 'USD' } }),
    ]);

    if (!paymentAuthorizedTransaction) {
      throw new Error(`NoPaymentAuthorized event is found with paymentId ${idPayment}`);
    }

    const rate = conversionRate.rates.USD;
    const transactionFee = new BigNumber(gasUsed).times(gasPrice);
    const usdValue = transactionFee
      .times(rate)
      .div(10 ** 18)
      .div(numberOfPaymentsExecutedInTx)
      .toFixed(2);

    const tokenNormalizedAddress =
      tokenAddress === '0x0000000000000000000000000000000000000000'
        ? '0x0'
        : tokenAddress.toLowerCase();
    const token = getTokenByAddress(tokenNormalizedAddress);

    if (!token) {
      throw new Error(`No token found for address: ${tokenAddress}`);
    }

    const { milestoneId, campaignId, donationTxHash } = paymentAuthorizedTransaction;

    await service.create({
      hash: transactionHash,
      event: event.event,
      usdValue,
      recipientAddress: recipient,
      milestoneId,
      campaignId,
      transactionFee,
      donationTxHash,
      timestamp,
      from,
      payments: [{ amount, symbol: token.symbol }],
      paidByGiveth: true,
      paymentId: idPayment,
    });
    const milestone = await app.service('milestones').get(milestoneId);
    const payment = {
      amount,
      symbol: token.symbol,
      decimals: token.decimals,
    };
    await createPayoutConversation(app, {
      milestoneId,
      recipientAddress: milestone.recipientAddress,
      timestamp,
      payment,
      txHash: transactionHash,
    });
    await moneyWentToRecipientWallet(app, {
      milestone,
      token,
      amount,
    });
  },
});

module.exports = payments;
