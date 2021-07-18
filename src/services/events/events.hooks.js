const { disallow } = require('feathers-hooks-common');

const createPendingRecipientAddress = () => async context => {
  const { result } = context;
  if (result.event !== 'RecipientChanged') {
    return context;
  }
  const traceService = context.app.service('traces');
  const [milestone] = await traceService.find({
    paginate: false,
    query: {
      projectId: Number(result.returnValues.idProject),
    },
  });
  if (milestone) {
    await traceService.patch(milestone._id, {
      pendingRecipientAddress: result.returnValues.recipient,
    });
  }
  return context;
};

module.exports = {
  before: {
    all: [],
    find: [],
    get: [],
    create: [disallow('external')],
    update: [disallow('external')],
    patch: [disallow('external')],
    remove: [disallow('external')],
  },

  after: {
    all: [],
    find: [],
    get: [],
    create: [createPendingRecipientAddress()],
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
