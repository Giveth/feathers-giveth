const logger = require('winston');
const { disallow } = require('feathers-hooks-common');
const {
  updateBridgePaymentExecutedTxHash,
  updateBridgePaymentAuthorizedTxHash,
} = require('../../repositories/donationRepository');
const { HomePaymentsEventTypes } = require('../../models/homePaymentsTransactions.model');

const getEntityGasUsedPrice = (app, fieldName, id) => {
  return app
    .service('homePaymentsTransactions')
    .Model.aggregate()
    .match({
      [fieldName]: id,
    })
    .group({
      _id: id,
      totalAmount: { $sum: '$usdValue' },
    });
};
const updateEntitiesGasPayments = () => async context => {
  const { app, result } = context;
  const {
    recipientAddress,
    milestoneId,
    campaignId,
    donationTxHash,
    hash,
    timestamp,
    from,
    paidByGiveth,
    _id,
    event,
  } = result;
  if (event === HomePaymentsEventTypes.PaymentExecuted) {
    await updateBridgePaymentExecutedTxHash(app, {
      txHash: donationTxHash,
      bridgePaymentExecutedTxHash: hash,
      bridgePaymentExecutedTime: timestamp,
    });
  } else if (event === HomePaymentsEventTypes.PaymentAuthorized) {
    await updateBridgePaymentAuthorizedTxHash(app, {
      txHash: donationTxHash,
      bridgePaymentAuthorizedTxHash: hash,
    });
  }
  // If gas is not paid by Giveth we can skip
  if (!paidByGiveth) {
    logger.error('The from of transaction is not a giveth account', {
      from,
      _id,
    });
    return context;
  }
  const [
    [recipientTotalGasUsed],
    [milestoneTotalGasUsed],
    [campaignTotalGasUsed],
  ] = await Promise.all([
    getEntityGasUsedPrice(app, 'recipientAddress', recipientAddress),
    getEntityGasUsedPrice(app, 'milestoneId', milestoneId),
    getEntityGasUsedPrice(app, 'campaignId', campaignId),
  ]);

  await Promise.all([
    app.service('users').Model.updateOne(
      { address: recipientAddress },
      {
        $set: { gasPaidUsdValue: recipientTotalGasUsed.totalAmount, address: recipientAddress },
      },
      { upsert: true, timestamps: false },
    ),
    app
      .service('milestones')
      .Model.updateOne(
        { _id: milestoneId },
        { gasPaidUsdValue: milestoneTotalGasUsed.totalAmount },
        { timestamps: false },
      ),
    app
      .service('campaigns')
      .Model.updateOne(
        { _id: campaignId },
        { gasPaidUsdValue: campaignTotalGasUsed.totalAmount },
        { timestamps: false },
      ),
  ]);

  return context;
};

module.exports = {
  before: {
    all: [],
    find: [],
    get: [],
    create: [disallow('external')],
    update: [disallow('external')],
    patch: [disallow('external')],
    remove: [disallow('external')],
  },

  after: {
    all: [],
    find: [],
    get: [],
    create: [updateEntitiesGasPayments()],
    update: [updateEntitiesGasPayments()],
    patch: [updateEntitiesGasPayments()],
    remove: [],
  },

  error: {
    all: [],
    find: [],
    get: [],
    create: [],
    update: [],
    patch: [],
    remove: [],
  },
};
