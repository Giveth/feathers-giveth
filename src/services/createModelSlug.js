const slugify = require('../utils/slugify');

const createModelSlug = modelName => async context => {
  const { data, app } = context;
  if (!data.title) {
    return context;
  }
  const service = app.service(modelName);
  const slug = slugify(data.title);
  let realSlug;
  let count = 0;
  let postfix = 0;

  do {
    realSlug = postfix === 0 ? slug : `${slug}-${postfix + 1}`;
    // eslint-disable-next-line no-await-in-loop
    count = await service.Model.countDocuments({
      slug: realSlug,
      _id: { $ne: context.id },
    });
    postfix += 1;
  } while (count > 0);
  data.slug = realSlug;
  return context;
};
module.exports = createModelSlug;
