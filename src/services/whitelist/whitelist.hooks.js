const { getTokenBySymbol } = require('../../utils/tokenHelper');

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
        addresses
          .filter(a => !users.find(u => u.address === a))
          .map(address => ({
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
  let activeTokenWhitelist =
    app.get('activeTokenWhitelist') &&
    app.get('activeTokenWhitelist').map(symbol => {
      return getTokenBySymbol(symbol);
    });
  if (!activeTokenWhitelist) {
    activeTokenWhitelist = app.get('tokenWhitelist');
  }
  const fiatWhitelist = app.get('fiatWhitelist');
  const nativeCurrencyWhitelist = app.get('nativeCurrencyWhitelist');

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
      activeTokenWhitelist,
      fiatWhitelist,
      nativeCurrencyWhitelist,
    };

    return context;
  });
};

module.exports = {
  // TODO I think all method should be disallowed o not-implemented except GET
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
