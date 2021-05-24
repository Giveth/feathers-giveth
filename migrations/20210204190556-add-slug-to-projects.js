const async = require('async');

function slugify(title) {
  const a = 'àáâäæãåāăąçćčđďèéêëēėęěğǵḧîïíīįìłḿñńǹňôöòóœøōõőṕŕřßśšşșťțûüùúūǘůűųẃẍÿýžźż·/_,:;';
  const b = 'aaaaaaaaaacccddeeeeeeeegghiiiiiilmnnnnoooooooooprrsssssttuuuuuuuuuwxyyzzz------';
  const p = new RegExp(a.split('').join('|'), 'g');

  return title
    .toString()
    .toLowerCase()
    .replace(/\s+/g, '-') // Replace spaces with -
    .replace(p, c => b.charAt(a.indexOf(c))) // Replace special characters
    .replace(/&/g, '-and-') // Replace & with 'and'
    .replace(/[^\w-]+/g, '') // Remove all non-word characters
    .replace(/--+/g, '-') // Replace multiple - with single -
    .replace(/^-+/, '') // Trim - from start of text
    .replace(/-+$/, ''); // Trim - from end of text
}

async function createSlug(id, title, collection) {
  const slug = slugify(title);
  let realSlug;
  let count = 0;
  let postfix = 0;
  await async.doWhilst(
    cb => {
      realSlug = postfix === 0 ? slug : `${slug}-${postfix + 1}`;
      collection
        .countDocuments({
          slug: realSlug,
          _id: { $ne: id },
        })
        .then(_count => {
          count = _count;
          cb();
        })
        .catch(err => {
          cb(err);
        });
      postfix += 1;
    },
    testCb => {
      testCb(null, count > 0);
    },
  );
  return realSlug;
}

module.exports = {
  async up(db, client) {
    // add slug to communities
    const dacs = await db
      .collection('dacs')
      .find({})
      .project({ title: true })
      .toArray();
    await async.eachLimit(dacs, 1, (dac, cb) => {
      const { title } = dac;
      createSlug(dac._id, title, db.collection('dacs')).then(slug => {
        db.collection('dacs')
          .updateOne({ _id: dac._id }, { $set: { slug } })
          .then(() => {
            cb();
          });
      });
    });
    // add slug to campaigns
    const campaigns = await db
      .collection('campaigns')
      .find({})
      .project({ title: true })
      .toArray();
    await async.eachLimit(campaigns, 1, (campaign, cb) => {
      const { title } = campaign;
      createSlug(campaign._id, title, db.collection('campaigns')).then(slug => {
        db.collection('campaigns')
          .updateOne({ _id: campaign._id }, { $set: { slug } })
          .then(() => {
            cb();
          });
      });
    });

    // add slug to milestones
    const milestones = await db
      .collection('milestones')
      .find({})
      .project({ title: true })
      .toArray();
    await async.eachLimit(milestones, 1, (milestone, cb) => {
      const { title } = milestone;
      createSlug(milestone._id, title, db.collection('milestones')).then(slug => {
        db.collection('milestones')
          .updateOne({ _id: milestone._id }, { $set: { slug } })
          .then(() => {
            cb();
          });
      });
    });
    await db.collection('dacs').createIndex({ slug: 1 }, { unique: true });
    await db.collection('campaigns').createIndex({ slug: 1 }, { unique: true });
    await db.collection('milestones').createIndex({ slug: 1 }, { unique: true });
  },

  async down(db, client) {
    await db.collection('dacs').dropIndex({ slug: 1 }, { unique: true });
    await db.collection('campaigns').dropIndex({ slug: 1 }, { unique: true });
    await db.collection('milestones').dropIndex({ slug: 1 }, { unique: true });
  },
};
