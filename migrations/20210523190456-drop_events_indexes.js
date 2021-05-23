module.exports = {
  async up(db, _client) {
    await db.collection('events').dropIndexes();
  },

  async down(_db, _client) {
    // TODO write the statements to rollback your migration (if possible)
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: false}});
  },
};
