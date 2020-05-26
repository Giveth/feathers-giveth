const mongoose = require('mongoose');
const { toBN } = require('web3-utils');

/**
 * NOTE: Make sure to point this to the correct config!
 * */
const config = require('../../config/default.json');

const mongoUrl = config.mongodb;
console.log('url:', mongoUrl);
mongoose.connect(mongoUrl);
const db = mongoose.connection;

db.on('error', err => console.error('migrateToTokens > Could not connect to Mongo', err));

// once mongo connected, start migration
db.once('open', async () => {
  console.log('Connected to Mongo');

  const Conversations = db.collection('conversations');
  const Donations = db.collection('donations');
  try {
    const conversations = await Conversations.find({
      messageContext: 'payment',
    }).toArray();
    await Promise.all(
      conversations.map(async conversation => {
        const donations = await Donations.find({
          txHash: conversation.txHash,
          status: 'Paid',
        }).toArray();

        const payments = [];

        donations.forEach(donation => {
          const { amount } = donation;
          const { symbol, decimals } = donation.token;
          const index = payments.findIndex(p => p.symbol === symbol);

          if (index !== -1) {
            payments[index].amount = toBN(amount)
              .add(toBN(payments[index].amount))
              .toString();
          } else {
            payments.push({ symbol, amount, tokenDecimals: decimals });
          }
        });

        return Conversations.updateOne(
          { _id: conversation._id },
          {
            $set: {
              payments,
            },
            $unset: {
              paidAmount: '',
              paidSymbol: '',
            },
          },
        );
      }),
    );
    console.log('Done');
    process.exit();
  } catch (e) {
    console.error(e);
  }
});
