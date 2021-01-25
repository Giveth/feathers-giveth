const isRequestInternal = context => {
  return context.params.provider === undefined;
};

module.exports = {
  isRequestInternal,
};
