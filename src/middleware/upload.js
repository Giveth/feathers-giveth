export const multipartTransfer = (req, res, next) => {
  req.feathers.file = req.file;
  next();
};
