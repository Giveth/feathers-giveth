/**
 * You can run this script like this:
 * NODE_ENV=develop USER_ADDRESS=0x5AC583Feb2b1f288C0A51d6Cdca2e8c814BFE93B node scripts/makeUserAdmin.js
 */

const config = require('config');
const mongoose = require('mongoose');

const userAddress = process.env.USER_ADDRESS;
if (!process.env.NODE_ENV) {
  throw new Error('NODE_ENV is required and should pass it in environment variables');
}
if (!userAddress) {
  throw new Error('USER_ADDRESS is required and should pass it in environment variables');
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
