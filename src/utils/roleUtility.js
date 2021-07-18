const isUserAdmin = async (app, address) => {
  const userService = app.service('users');
  const user = await userService.get(address);
  return Boolean(user.isAdmin);
};

const isUserInDelegateWhiteList = async (app, address) => {
  const userService = app.service('users');
  const user = await userService.get(address);
  return Boolean(user.isAdmin || user.isDelegator);
};

const isUserInProjectWhiteList = async (app, address) => {
  const userService = app.service('users');
  const user = await userService.get(address);
  return Boolean(user.isAdmin || user.isProjectOwner);
};

const isUserInReviewerWhiteList = async (app, address) => {
  const userService = app.service('users');
  const user = await userService.get(address);
  return Boolean(user.isAdmin || user.isReviewer);
};

module.exports = {
  isUserAdmin,
  isUserInDelegateWhiteList,
  isUserInReviewerWhiteList,
  isUserInProjectWhiteList,
};
