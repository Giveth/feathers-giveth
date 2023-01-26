module.exports = {
  async up(db, _client) {
    await db
      .collection('conversations')
      .updateMany(
        { performedByRole: 'Milestone Owner' },
        { $set: { performedByRole: 'Trace Owner' } },
      );
  },

  async down(db, _client) {
    await db
      .collection('conversations')
      .updateMany(
        { performedByRole: 'Trace Owner' },
        { $set: { performedByRole: 'Milestone Owner' } },
      );
  },
};
