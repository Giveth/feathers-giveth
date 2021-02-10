function slugify(title) {
  return title
    .replace(/[^a-zA-Z\d\s_()-./\\]/g, '')
    .replace(/(\s|_|\(|\)|\/|\\|\.)+/g, '-')
    .toLowerCase();
}
module.exports = {
  async up(db, client) {
    // add slug to dacs
    const dacs = await db
      .collection('dacs')
      .find({})
      .toArray();
    await Promise.all(
      dacs.map(async dac => {
        const { title } = dac;
        const slug = slugify(title);
        await db.collection('dacs').updateOne({ _id: dac._id }, { $set: { slug } });
      }),
    );

    // add slug to campaigns
    const campaigns = await db
      .collection('campaigns')
      .find({})
      .toArray();
    await Promise.all(
      campaigns.map(async campaign => {
        const { title } = campaign;
        const slug = slugify(title);
        await db.collection('campaigns').updateOne({ _id: campaign._id }, { $set: { slug } });
      }),
    );

    // add slug to milestones
    const milestones = await db
      .collection('milestones')
      .find({})
      .toArray();
    await Promise.all(
      milestones.map(async milestone => {
        const { title } = milestone;
        const slug = slugify(title);
        await db.collection('milestones').updateOne({ _id: milestone._id }, { $set: { slug } });
      }),
    );
    await db.collection('dacs').createIndex({ slug: 1 }, { unique: true });
    // await db.collection('campaigns').createIndex({ slug: 1 }, { unique: true });
    // await db.collection('milestones').createIndex({ slug: 1 }, { unique: true });
  },

  async down(db, client) {
    // TODO write the statements to rollback your migration (if possible)
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: false}});
  },
};
