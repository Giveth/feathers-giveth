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
  const { recipientAddress, traceId, campaignId, donationTxHash, hash, timestamp } = result;
  const [
    [recipientTotalGasUsed],
    [milestoneTotalGasUsed],
    [campaignTotalGasUsed],
  ] = await Promise.all([
    getEntityGasUsedPrice(app, 'recipientAddress', recipientAddress),
    getEntityGasUsedPrice(app, 'traceId', traceId),
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
      .service('traces')
      .Model.updateOne(
        { _id: traceId },
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
  if (result.event === HomePaymentsEventTypes.PaymentExecuted) {
    await updateBridgePaymentExecutedTxHash(app, {
      txHash: donationTxHash,
      bridgePaymentExecutedTxHash: hash,
      bridgePaymentExecutedTime: timestamp,
    });
  } else if (result.event === HomePaymentsEventTypes.PaymentAuthorized) {
    await updateBridgePaymentAuthorizedTxHash(app, {
      txHash: donationTxHash,
      bridgePaymentAuthorizedTxHash: hash,
    });
  }
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
