const { disallow } = require('feathers-hooks-common');

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

  const { recipientAddress, milestoneId, campaignId } = result;

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
      { upsert: true },
    ),
    app
      .service('milestones')
      .Model.updateOne(
        { _id: milestoneId },
        { gasPaidUsdValue: milestoneTotalGasUsed.totalAmount },
      ),
    app
      .service('campaigns')
      .Model.updateOne({ _id: campaignId }, { gasPaidUsdValue: campaignTotalGasUsed.totalAmount }),
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
