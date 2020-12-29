module.exports = {
  // eslint-disable-next-line no-unused-vars
  async up(db, client) {
    // TODO write your migration here.
    // See https://github.com/seppevs/migrate-mongo/#creating-a-new-migration-script
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: true}});
    await db.collection('transactions').deleteMany({
      $or: [{ blockNumber: { $exists: false } }, { timestamp: { $exists: false } }],
    });
  },

  // eslint-disable-next-line no-unused-vars
  async down(db, client) {
    // TODO write the statements to rollback your migration (if possible)
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: false}});
  },
};
