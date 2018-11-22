const { checkContext, getByDot } = require('feathers-hooks-common');

const notifyParent = (context, opts) => {
  const watchFields = opts.watchFields || [];

  if (!opts.childField || !opts.parentField || !opts.service) {
    throw new Error('childField, parentFiled, and service are required');
  }

  const valChanged = field => {
    const beforeVal = getByDot(context.params.before, field);
    const afterVal = getByDot(context.result, field);

    return beforeVal !== afterVal;
  };

  const changed = context.method === 'remove' || watchFields.some(field => valChanged(field));

  if (changed) {
    const service = context.app.service(opts.service);

    const params = {
      query: {},
    };

    params.query[opts.parentField] = getByDot(context.result, opts.childField);

    return service.find(params).then(resp => {
      resp.data.forEach(item => {
        service.emit('updated', item);
      });
    });
  }

  return Promise.resolve();
};

/**
 * emits an 'updated' event for the service, if any of the watchFields have changed. Must be used as an 'after' hook and
 * in conjunction with the stashBefore hook when using with update and patch methods
 *
 * @params
 *   notify {
 *             service: // name of the parent service to notify
 *             parentField: // name of the field on the parent entity for the join
 *             childField: // name of the field on the child entity to join
 *             watchFields: // array of child fields to notify parent of changes
 *           }
 */
module.exports = (...notify) => context => {
  checkContext(context, 'after', ['remove', 'update', 'patch']);

  if (!context.params.before) {
    throw new Error(
      'The notifyOfChange hook expects context.before to have the entity before mutation. Use the ' +
        'stashBefore hook to populate context.before with the entity being mutated',
    );
  }

  return Promise.all(notify.map(opts => notifyParent(context, opts)))
    .then(() => context)
    .catch(err => {
      console.error(err); // eslint-disable-line no-console
      return context;
    });
};
