const errors = require('@feathersjs/errors');

/**
 * This function checks if milestones name is unique in the campaign scope
 * */
const checkIfDacSlugIsUnique = () => async context => {
  const { data, app } = context;
  if (!data.slug) {
    return context;
  }
  const { slug } = data;
  const dacService = app.service('dacs');
  const dacWithSameSlug = await dacService.find({
    query: {
      slug,
    },
  });
  if (dacWithSameSlug.total > 0) {
    // milestone titles are supposed to be unique
    throw new errors.Forbidden(
      `A DAC with slug '${slug}' already exists. Please select a different slug.`,
      { showMessageInPopup: true },
    );
  }
  return context;
};

module.exports = checkIfDacSlugIsUnique;
