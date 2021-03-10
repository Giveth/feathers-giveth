const { ObjectID } = require('mongodb');

module.exports = {
  async up(db, _client) {
    const cursor = db.collection('donations').find({
      delegateType: { $exists: true },
      delegateTypeId: { $exists: true },
      intendedProjectType: { $exists: true },
    });
    // eslint-disable-next-line no-restricted-syntax
    for await (const donation of cursor) {
      const dacId = donation.delegateTypeId;
      const projectObjectId = donation.intendedProjectTypeId;
      let campaignId;

      // eslint-disable-next-line default-case
      switch (donation.intendedProjectType) {
        case 'campaign':
          campaignId = projectObjectId;
          break;
        case 'milestone':
          campaignId = (
            await db.collection('milestones').findOne({ _id: ObjectID(projectObjectId) })
          ).campaignId;
          break;
      }
      if (campaignId) {
        await db
          .collection('dacs')
          .updateOne({ _id: ObjectID(dacId) }, { $addToSet: { campaigns: campaignId } });
      }
    }
  },

  async down(db, _client) {
    await db.collection('dacs').updateMany({}, { $unset: { milestones: 1, campaigns: 1 } });
  },
};
