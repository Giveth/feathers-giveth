const getUsersByAddress = (app, addresses) =>
  app
    .service('/users')
    .find({
      query: {
        address: { $in: addresses },
        $select: ['_id', 'name', 'email', 'address', 'avatar'],
      },
    })
    .then(users => users.data);

const getWhitelist = () => context => {
  const { app } = context;

  // fetch whitelisted addresses from default.json
  const reviewers = app.get('useReviewerWhitelist') ? app.get('reviewerWhitelist') : [];
  const delegates = app.get('useDelegateWhitelist') ? app.get('delegateWhitelist') : [];
  const projectOwners = app.get('useProjectOwnerWhitelist') ? app.get('projectOwnerWhitelist') : [];

  // find all the users
  return Promise.all([
    getUsersByAddress(app, reviewers),
    getUsersByAddress(app, delegates),
    getUsersByAddress(app, projectOwners),
  ]).then(([reviewerUsers, delegateUsers, projectOwnerUsers]) => {
    context.result = {
      reviewerWhitelist: reviewerUsers,
      delegateWhitelist: delegateUsers,
      projectOwnerWhitelist: projectOwnerUsers,
    };

    return context;
  });
};

export default {
  before: {
    all: [],
    find: [],
    get: [],
    create: [],
    update: [],
    patch: [],
    remove: [],
  },

  after: {
    all: [],
    find: [getWhitelist()],
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
