// convienience function to provide golang like error handling
module.exports = function to(promise) {
  return promise.then(result => [null, result]).catch(err => [err]);
};
