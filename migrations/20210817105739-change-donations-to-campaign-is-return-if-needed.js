const { ObjectID } = require('mongodb');

const findParentDonation = (db, parentDonations) => {
  if (parentDonations.length === 0) {
    return undefined;
  }
  return db.collection('donations').findOne({ _id: ObjectID(parentDonations[0]) });
};
module.exports = {
  async up(db, _client) {
    const cursor = await db
      .collection('donations')
      .find({ ownerType: 'campaign', status: 'Committed', mined: true, isReturn: false });
    console.log('updated donations :');
    // eslint-disable-next-line no-restricted-syntax
    for await (const donation of cursor) {
      const { ownerTypeId, parentDonations } = donation;
      const parentDonation = await findParentDonation(db, parentDonations);
      // console.log('donations', { donation, parentDonation });

      if (!parentDonation || !['Paid', 'Committed'].includes(parentDonation.status)) {
        // eslint-disable-next-line no-continue
        continue;
      }
      const grandParentDonation = await findParentDonation(db, parentDonation.parentDonations);
      if (
        grandParentDonation &&
        grandParentDonation.status === 'Committed' &&
        grandParentDonation.ownerType === 'campaign' &&
        grandParentDonation.ownerTypeId === ownerTypeId
      ) {
        // in this case we know that money went from campaign to  a trace, the recipient of
        // that trace is very campaign, so after disbursing (withdraw), the money go back to campaign
        console.log(String(donation._id));
        db.collection('donations').updateOne({ _id: donation._id }, { $set: { isReturn: true } });
      }
    }
  },

  // eslint-disable-next-line no-empty-function
  async down(_db, _client) {},
};
