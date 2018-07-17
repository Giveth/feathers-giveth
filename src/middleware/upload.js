const multipartTransfer = (req, res, next) => {
  req.feathers.file = req.file;
  next();
};
module.exports = multipartTransfer;
