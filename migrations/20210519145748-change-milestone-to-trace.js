module.exports = {
  async up(db, _client) {
    await db
      .collection('conversations')
      .updateMany({}, { $rename: { milestoneId: 'traceId' } }, false, true);
    await db
      .collection('emails')
      .updateMany({}, { $rename: { milestoneId: 'traceId' } }, false, true);
    await db
      .collection('homePaymentsTransactions')
      .updateMany({}, { $rename: { milestoneId: 'traceId' } }, false, true);
    await db
      .collection('subscriptions')
      .updateMany({ projectType: 'milestone' }, { $set: { projectType: 'trace' } });
    await db
      .collection('donations')
      .updateMany({ intendedProjectType: 'milestone' }, { $set: { intendedProjectType: 'trace' } });
    await db
      .collection('pledgeadmins')
      .updateMany({ type: 'milestone' }, { $set: { type: 'trace' } });
    await db
      .collection('donations')
      .updateMany({ ownerType: 'milestone' }, { $set: { ownerType: 'trace' } });
    await db.collection('milestones').rename('traces');
  },

  async down(db, _client) {
    await db
      .collection('conversations')
      .updateMany({}, { $rename: { traceId: 'milestoneId' } }, false, true);
    await db
      .collection('emails')
      .updateMany({}, { $rename: { traceId: 'milestoneId' } }, false, true);
    await db
      .collection('homePaymentsTransactions')
      .updateMany({}, { $rename: { traceId: 'milestoneId' } }, false, true);
    await db
      .collection('subscriptions')
      .updateMany({ projectType: 'trace' }, { $set: { projectType: 'milestone' } });
    await db
      .collection('donations')
      .updateMany({ intendedProjectType: 'trace' }, { $set: { intendedProjectType: 'milestone' } });
    await db
      .collection('pledgeadmins')
      .updateMany({ type: 'trace' }, { $set: { type: 'milestone' } });
    await db
      .collection('donations')
      .updateMany({ ownerType: 'trace' }, { $set: { ownerType: 'milestone' } });
    await db.collection('traces').rename('milestones');
  },
};
