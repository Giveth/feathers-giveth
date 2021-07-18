module.exports = {
  async up(db, _client) {
    // We delete these fields from donations, the PaymentExecuted and PaymentAuthorized handling will fill it
    await db.collection('conversations').deleteMany({ messageContext: 'payout' });
  },

  async down(_db, _client) {
    //
  },
};
