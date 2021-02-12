const async = require('async');
const slugify = require('../../utils/slugify');

/**
 * This function checks if milestones name is unique in the campaign scope
 * */
const createMilestoneSlug = () => async context => {
  const { data, app } = context;
  if (data.slug) {
    return context;
  }
  const service = app.service('milestones');
  const slug = slugify(data.title);
  let realSlug;
  let count = 0;
  let postfix = 0;
  await async.doWhilst(
    cb => {
      realSlug = postfix === 0 ? slug : `${slug}-${postfix + 1}`;
      service.Model.countDocuments({
        slug: realSlug,
        _id: { $ne: context.id },
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
  data.slug = realSlug;
  return context;
};
module.exports = createMilestoneSlug;
