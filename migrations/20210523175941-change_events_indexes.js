module.exports = {
  async up(db, _client) {
    await db.collection('events').createIndex({ blockNumber: 1, transactionIndex: 1, logIndex: 1 });
    await db
      .collection('events')
      .createIndex(
        { isHomeEvent: 1, blockNumber: 1, transactionIndex: 1, logIndex: 1 },
        { unique: true },
      );
    await db.collection('events').dropIndex({
      transactionHash: 1,
      logIndex: 1,
      transactionIndex: 1,
      blockNumber: 1,
      status: 1,
    });
    await db
      .collection('events')
      .dropIndex({ transactionIndex: 1, blockNumber: 1, logIndex: 1 }, { unique: true });
  },

  async down(db, _client) {
    await db.collection('events').dropIndex({ blockNumber: 1, transactionIndex: 1, logIndex: 1 });
    await db
      .collection('events')
      .dropIndex(
        { isHomeEvent: 1, blockNumber: 1, transactionIndex: 1, logIndex: 1 },
        { unique: true },
      );
    await db.collection('events').createIndex({
      transactionHash: 1,
      logIndex: 1,
      transactionIndex: 1,
      blockNumber: 1,
      status: 1,
    });
    await db
      .collection('events')
      .createIndex({ transactionIndex: 1, blockNumber: 1, logIndex: 1 }, { unique: true });
  },
};
