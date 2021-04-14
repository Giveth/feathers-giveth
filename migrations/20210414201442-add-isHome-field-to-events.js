module.exports = {
  async up(db, _) {
    await db
      .collection('events')
      .updateMany({ isHomeEvent: { $exists: false } }, { $set: { isHomeEvent: false } });
  },

  async down(db, _) {
    await db
      .collection('events')
      .updateMany({ isHomeEvent: { $ne: true } }, { $unset: { isHomeEvent: 1 } });
  },
};
