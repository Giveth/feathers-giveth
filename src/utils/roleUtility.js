const config = require('config');

const isUserAdmin = address => {
  const admins = config.get('admins');
  return Boolean(admins.find(adminAddress => adminAddress === address));
};

const isUserInDelegateWhiteList = async (app, address) => {
  if (isUserAdmin(address)) {
    return true;
  }
  const userService = app.service('users');
  const user = await userService.get(address);
  return user.isInDelegateWhitelist;
};

const isUserInProjectWhiteList = async (app, address) => {
  if (isUserAdmin(address)) {
    return true;
  }
  const userService = app.service('users');
  const user = await userService.get(address);
  return user.isInProjectWhitelist;
};

const isUserInReviewerWhiteList = async (app, address) => {
  if (isUserAdmin(address)) {
    return true;
  }
  const userService = app.service('users');
  const user = await userService.get(address);
  return user.isInReviewerWhitelist;
};

module.exports = {
  isUserAdmin,
  isUserInDelegateWhiteList,
  isUserInReviewerWhiteList,
  isUserInProjectWhiteList,
};
