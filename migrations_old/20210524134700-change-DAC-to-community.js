module.exports = {
  async up(db, _client) {
    await db
      .collection('campaigns')
      .updateMany({}, { $rename: { dacs: 'communities' } }, false, true);
    await db
      .collection('traces')
      .updateMany({}, { $rename: { dacId: 'communityId' } }, false, true);
    await db
      .collection('subscriptions')
      .updateMany({ projectType: 'dac' }, { $set: { projectType: 'community' } });
    await db
      .collection('donations')
      .updateMany({ delegateType: 'dac' }, { $set: { delegateType: 'community' } });
    await db
      .collection('pledgeadmins')
      .updateMany({ type: 'dac' }, { $set: { type: 'community' } });
    try {
      // add This line in try-catch, otherwise it will get error if there is communities already
      await db.collection('dacs').rename('communities');
    } catch (e) {
      //
    }
  },

  async down(db, _client) {
    await db
      .collection('campaigns')
      .updateMany({}, { $rename: { communities: 'dacs' } }, false, true);
    await db
      .collection('traces')
      .updateMany({}, { $rename: { communityId: 'dacId' } }, false, true);
    await db
      .collection('subscriptions')
      .updateMany({ projectType: 'community' }, { $set: { projectType: 'dac' } });
    await db
      .collection('pledgeadmins')
      .updateMany({ type: 'community' }, { $set: { type: 'dac' } });
    await db
      .collection('donations')
      .updateMany({ delegateType: 'community' }, { $set: { delegateType: 'dac' } });
    try {
      // add This line in try-catch, otherwise it will get error if there is dacs already
      await db.collection('communities').rename('dacs');
    } catch (e) {
      //
    }
  },
};
