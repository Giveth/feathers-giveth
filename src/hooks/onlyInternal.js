import errors from 'feathers-errors';

export default () => context => {
  if (context.params.provider !== undefined) {
    throw new errors.Forbidden();
  }

  return context;
};
