const errors = require('@feathersjs/errors');
const logger = require('winston');
const {findTraceByQuery} = require('../../repositories/traceRepository')
const { getSimilarTitleInTraceRegex } = require('../../utils/regexUtils');
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
  const query = {
    _id: { $ne: context.id },
    campaignId: data.campaignId,
    // title: getSimilarTitleInTraceRegex(title),
    title,
  };
  // const traceWithSameName = await traceService.find({
  //   query,
  // });
  // if (traceWithSameName.total > 0) {
  //   logger.info('checkIfTraceNameIsUnique ', {
  //     query,
  //     foundTraces: traceWithSameName.data.map(trace => {
  //       return {
  //         title: trace.title,
  //         id: trace.id,
  //         _id: trace._id,
  //       };
  //     }),
  //   });
  //   // trace titles are supposed to be unique
  //   throw new errors.Forbidden(
  //     'Trace title is repetitive. Please select a different title for the trace.',
  //   );
  // }
  const traceWithSameName = await findTraceByQuery(app, query);
  if (traceWithSameName.length > 0) {
    logger.info('checkIfTraceNameIsUnique ', {
      query,
      foundTraces: traceWithSameName.map(trace => {
        return {
          title: trace.title,
          _id: trace._id,
        };
      }),
    });
    // trace titles are supposed to be unique
    throw new errors.Forbidden(
      'Trace title is repetitive. Please select a different title for the trace.',
    );
  }
  return context;
};

module.exports = checkIfTraceNameIsUnique;
