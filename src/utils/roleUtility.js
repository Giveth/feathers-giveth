const config = require('config');

const isUserAdmin = address => {
  const admins = config.get('admins');
  return admins.some(adminAddress => adminAddress === address);
};

const isUserInDelegateWhiteList = async (app, address) => {
  if (isUserAdmin(address)) {
    return true;
  }
  const userService = app.service('users');
  const user = await userService.get(address);
  return user.isDelegator;
};

const isUserInProjectWhiteList = async (app, address) => {
  if (isUserAdmin(address)) {
    return true;
  }
  const userService = app.service('users');
  const user = await userService.get(address);
  return user.isProjectOwner;
};

const isUserInReviewerWhiteList = async (app, address) => {
  if (isUserAdmin(address)) {
    return true;
  }
  const userService = app.service('users');
  const user = await userService.get(address);
  return user.isReviewer;
};

module.exports = {
  isUserAdmin,
  isUserInDelegateWhiteList,
  isUserInReviewerWhiteList,
  isUserInProjectWhiteList,
};
