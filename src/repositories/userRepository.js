const findUserByAddress = (app, address, projection = {}) => {
  const userModel = app.service('users').Model;
  return userModel.findOne({ address }, projection);
};

module.exports = {
  findUserByAddress,
};
