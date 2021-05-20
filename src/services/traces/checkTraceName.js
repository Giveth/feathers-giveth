const errors = require('@feathersjs/errors');

/**
 * This function checks if traces name is unique in the campaign scope
 * */
const checkIfTraceNameIsUnique = () => async context => {
  const { data, app } = context;
  if (!data.title) {
    return context;
  }
  const title = data.title.trim();
  const traceService = app.service('traces');
  if (!data.campaignId) {
    const trace = await traceService.get(context.id);
    if (trace) {
      data.campaignId = trace.campaignId;
    }
  }
  const traceWithSameName = await traceService.find({
    query: {
      _id: { $ne: context.id },
      campaignId: data.campaignId,
      title: new RegExp(`\\s*${title.replace(/^\s+|\s+$|\s+(?=\s)/g, '')}\\s*`, 'i'),
    },
  });
  if (traceWithSameName.total > 0) {
    // trace titles are supposed to be unique
    throw new errors.Forbidden(
      'Milestone title is repetitive. Please select a different title for the trace.',
    );
  }
  return context;
};

module.exports = checkIfTraceNameIsUnique;
