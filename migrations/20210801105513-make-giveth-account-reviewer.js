module.exports = {
  async up(db, _client) {
    if (
      process.env.NODE_ENV !== 'develop' &&
      process.env.NODE_ENV !== 'production' &&
      process.env.NODE_ENV !== 'test'
    ) {
      // We should not change user role in production and develop and test environments
      await db
        .collection('users')
        .updateOne(
          { address: '0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1' },
          { $set: { isReviewer: true } },
        );
    }
  },

  async down(_db, _client) {
    //
  },
};
