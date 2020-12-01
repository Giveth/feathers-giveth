module.exports = {
  async up(db, client) {
    const tokenSymbols = ['ETH', 'DAI', 'PAN', 'WBTC', 'ANT'];
    for (const symbol of tokenSymbols) {
      // we can unset the token field as well
      await db.collection('milestones')
        .updateMany({ 'token.symbol': symbol }, { $set: { tokenSymbol: symbol } });
      await db.collection('donations')
        .updateMany({ 'token.symbol': symbol }, { $set: { tokenSymbol: symbol } });

    }
  },

  async down(db, client) {
    await db.collection('milestones').updateMany({}, { $unset: { tokenSymbol: 1 } });

    await db.collection('donations').updateMany({}, { $unset: { tokenSymbol: 1 } });
  },
};
