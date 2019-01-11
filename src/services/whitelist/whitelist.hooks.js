const getUsersByAddress = (app, addresses) =>
  app
    .service('/users')
    .find({
      paginate: false,
      query: {
        address: { $in: addresses },
        $select: ['name', 'email', 'address', 'avatar'],
      },
    })
    .then(users =>
      users.concat(
        addresses.filter(a => !users.find(u => u.address === a)).map(address => ({
          address,
        })),
      ),
    );

const getWhitelist = () => context => {
  const { app } = context;

  // fetch whitelisted addresses from default.json
  const reviewers = app.get('useReviewerWhitelist') ? app.get('reviewerWhitelist') : [];
  const delegates = app.get('useDelegateWhitelist') ? app.get('delegateWhitelist') : [];
  const projectOwners = app.get('useProjectOwnerWhitelist') ? app.get('projectOwnerWhitelist') : [];
  const tokenWhitelist = app.get('tokenWhitelist');
  const fiatWhitelist = app.get('fiatWhitelist');

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
      tokenWhitelist,
      fiatWhitelist,
    };

    return context;
  });
};

module.exports = {
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
