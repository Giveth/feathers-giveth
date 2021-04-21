/**
 * You can run this script like this:
 * NODE_ENV=develop  node scripts/makeUserAdmin.js 0x5AC583Feb2b1f288C0A51d6Cdca2e8c814BFE93B
 */

const config = require('config');
const mongoose = require('mongoose');

const userAddress = process.argv[2];

if (!userAddress) {
  console.error('Usage: makeUserAdmin.js USER_ADDRESS');
  console.error('USER_ADDRESS should be passed as an argument');
  process.exit(1);
}
const mongoUrl = config.mongodb;
mongoose.connect(mongoUrl);
const db = mongoose.connection;
db.on('error', err => console.error(`Could not connect to Mongo:\n${err.stack}`));

db.once('open', async () => {
  console.info('Connected to Mongo');
  const isUserExists = await db.collection('users').findOne({ address: userAddress });
  if (!isUserExists) {
    console.error(`User with address ${userAddress} not found`);
    process.exit(0);
  }
  await db.collection('users').updateOne(
    { address: userAddress },
    {
      $set: { isAdmin: true },
    },
  );
  console.log('user updated successfully');
  process.exit(0);
});
