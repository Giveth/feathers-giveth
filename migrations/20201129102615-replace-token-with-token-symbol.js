const config = require('config')
module.exports = {
  async up(db, client) {
    const tokenAddresses= config.get('tokenWhitelist').map(token => token.address)
    for (const address of tokenAddresses) {
      // we can unset the token field as well
      await db.collection('milestones')
        .updateMany({ 'token.address': address }, { $set: { tokenAddress: address } });
      await db.collection('donations')
        .updateMany({ 'token.address': address }, { $set: { tokenAddress: address } });

    }
  },

  async down(db, client) {
    await db.collection('milestones').updateMany({}, { $unset: { tokenAddress: 1 } });

    await db.collection('donations').updateMany({}, { $unset: { tokenAddress: 1 } });
  },
};
