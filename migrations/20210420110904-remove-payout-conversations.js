module.exports = {
  async up(db, _client) {
    // We delete these fields from donations, the PaymentExecuted and PaymentAuthorized handling will fill it
    await db
      .collection('donations')
      .updateMany({}, { $unset: { bridgeStatus: 1, bridgeTxHash: 1, bridgeTransactionTime: 1 } });
  },

  async down(_db, _client) {
    //
  },
};
