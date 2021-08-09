const errors = require('@feathersjs/errors');
const commons = require('feathers-hooks-common');
const config = require('config');

const { rateLimit } = require('../../utils/rateLimit');
const { ProjectTypes } = require('../../models/subscription.model');

const validatePayload = () => async context => {
  const { app, data } = context;
  const { projectTypeId, projectType, enabled } = data;
  if (!projectTypeId || !projectType || enabled === undefined) {
    throw new errors.BadRequest('projectTypeId and projectType and enabled are required');
  }

  let service;
  switch (projectType) {
    case ProjectTypes.TRACE:
      service = app.service('traces');
      break;
    case ProjectTypes.CAMPAIGN:
      service = app.service('campaigns');
      break;
    case ProjectTypes.COMMUNITY:
      service = app.service('communities');
      break;
    default:
      throw new errors.BadRequest('Invalid projectType');
  }
  const project = await service.get(projectTypeId, {
    query: {
      $select: ['_id'],
    },
  });
  if (!project) {
    throw new errors.NotFound();
  }
  return context;
};

module.exports = {
  before: {
    all: [],
    find: [],
    get: [],
    create: [
      validatePayload(),

      // We dont count failed requests so I put it in last before hook
      rateLimit({
        threshold: config.rateLimit.threshold,
        ttl: config.rateLimit.ttlSeconds,
      }),
    ],
    update: [commons.disallow()],
    patch: [commons.disallow()],
    remove: [commons.disallow()],
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
