const errors = require('@feathersjs/errors');
const { PROJECT_TYPE } = require('../../models/subscription.model');
const onlyInternal = require('../../hooks/onlyInternal');

const validatePayload = () => async context => {
  const { app, data, params } = context;
  const { user } = params;
  if (!user) {
    throw new errors.NotAuthenticated();
  }
  const { projectTypeId, projectType, enabled } = data;
  if (!projectTypeId || !projectType || enabled === undefined) {
    throw new errors.BadRequest('projectTypeId and projectType and enabled are required');
  }

  let service;
  switch (projectType) {
    case PROJECT_TYPE.MILESTONE:
      service = app.service('milestones');
      break;
    case PROJECT_TYPE.CAMPAIGN:
      service = app.service('campaigns');
      break;
    case PROJECT_TYPE.DAC:
      service = app.service('dacs');
      break;
    default:
      throw new errors.BadRequest('Invalid projectType');
  }
  const projects = await service.find({
    query: {
      _id: projectTypeId,
    },
    paginate: false,
  });
  if (projects.length === 0) {
    throw new errors.NotFound();
  }
  context.data.projectId = projects[0].projectId;
  return context;
};

module.exports = {
  before: {
    all: [],
    find: [],
    get: [],
    create: [validatePayload()],
    update: [onlyInternal()],
    patch: [onlyInternal()],
    remove: [onlyInternal()],
  },

  after: {
    all: [],
    find: [],
    get: [],
    create: [],
    update: [],
    patch: [],
    remove: [],
  },

  error: {
    all: [],
    find: [],
    get: [],
    create: [],
    update: [],
    patch: [],
    remove: [],
  },
};
