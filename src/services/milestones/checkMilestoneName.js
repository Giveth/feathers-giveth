const errors = require('@feathersjs/errors');

/**
 * This function checks if milestones name is unique in the campaign scope
 * */
const checkIfMilestoneNameIsUnique = () => async context => {
  const { data, app } = context;
  if (!data.title) {
    return context;
  }
  const title = data.title.trim();
  const milestoneService = app.service('milestones');
  if (!data.campaignId) {
    const milestone = await milestoneService.get(context.id);
    if (milestone) {
      data.campaignId = milestone.campaignId;
    }
  }
  const milestoneWithSameName = await milestoneService.find({
    query: {
      campaignId: data.campaignId,
      title: new RegExp(`\\s*${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`),
    },
  });
  if (milestoneWithSameName.total > 0) {
    // milestone titles are supposed to be unique
    throw new errors.Forbidden(
      'Milestone title is repetitive. Please select a different title for the milestone.',
      { showMessageInPopup: true },
    );
  }
  return context;
};

module.exports = checkIfMilestoneNameIsUnique;
