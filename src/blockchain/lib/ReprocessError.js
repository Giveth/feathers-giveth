module.exports = class ReprocessError extends Error {
  constructor(...args) {
    super(...args);
    Error.captureStackTrace(this, ReprocessError);
  }
};
