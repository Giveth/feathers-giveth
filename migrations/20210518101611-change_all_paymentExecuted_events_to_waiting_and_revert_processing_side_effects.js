module.exports = {
  async up(db, _client) {
    // The purpose of this migration is revert all changes that are related to PaymentExexuted and PaymentAuthorized events
    // then process all these events again (by changing their status to Waiting)
    await db.collection('conversations').deleteMany({ messageContext: 'payout' });
    await db.collection('users').updateMany({}, { $unset: { gasPaidUsdValue: 1 } });
    await db.collection('milestones').updateMany({}, { $unset: { gasPaidUsdValue: 1 } });
    await db.collection('campaigns').updateMany({}, { $unset: { gasPaidUsdValue: 1 } });
    await db
      .collection('events')
      .updateMany(
        { event: { $in: ['PaymentExecuted', 'PaymentAuthorized'] }, status: 'Processed' },
        { $set: { status: 'Waiting' } },
      );
    await db.collection('donations').updateMany(
      {},
      {
        $unset: {
          bridgePaymentExecutedTime: 1,
          bridgePaymentExecutedTxHash: 1,
          bridgePaymentAuthorizedTxHash: 1,
        },
      },
    );
  },

  async down(_db, _client) {
    // TODO write the statements to rollback your migration (if possible)
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: false}});
  },
};
