const multipartTransfer = (req, res, next) => {
  // eslint-disable-next-line no-param-reassign
  req.feathers.file = req.file;
  next();
};
module.exports = multipartTransfer;
