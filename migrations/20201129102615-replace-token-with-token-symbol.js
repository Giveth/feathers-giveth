const config = require('config');

module.exports = {
  // eslint-disable-next-line no-unused-vars
  async up(db, client) {
    const tokenAddresses = config.get('tokenWhitelist').map(token => token.address);

    // Add any token manually because it's not in config
    tokenAddresses.push('0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF');
    await Promise.all(
      tokenAddresses.map(async address => {
        // we can unset the token field as well
        await db
          .collection('milestones')
          .updateMany({ 'token.address': address }, { $set: { tokenAddress: address } });
        await db
          .collection('donations')
          .updateMany({ 'token.address': address }, { $set: { tokenAddress: address } });
      }),
    );
  },

  // eslint-disable-next-line no-unused-vars
  async down(db, client) {
    await db.collection('milestones').updateMany({}, { $unset: { tokenAddress: 1 } });

    await db.collection('donations').updateMany({}, { $unset: { tokenAddress: 1 } });
  },
};
