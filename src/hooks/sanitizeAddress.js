const errors = require('@feathersjs/errors');
const commons = require('feathers-hooks-common');
const { toChecksumAddress } = require('web3-utils');

/**
 * sanitize the specified fieldNames when the given methods are called. prepends 0x to address if needed and converts
 * to checksum address.
 *
 * @params
 *   fieldNames address fields to sanitize. can be an array or a single field
 *   opts  {
 *           required: // are the fields required? if true, and a field is missing, we will throw an error
 *           validate: // will throw an error if an invalid address is given
 *         }
 */
module.exports = (fieldNames, opts = { required: false, validate: false }) => context => {
  const { required, validate } = opts;

  commons.checkContext(context, 'before', ['find', 'create', 'update', 'patch', 'remove']);

  // eslint-disable-next-line no-param-reassign
  if (!Array.isArray(fieldNames)) fieldNames = [fieldNames];

  if (
    context.method === 'find' ||
    (['update', 'patch', 'remove'].indexOf(context.method) > -1 && !context.id)
  ) {
    if (context.params.query) {
      Object.keys(context.params.query).forEach(key => {
        if (required && fieldNames.indexOf(key) === -1)
          throw new errors.BadRequest(`"${key} is a required field`);

        if (fieldNames.indexOf(key) !== -1) {
          try {
            context.params.query[key] = toChecksumAddress(context.params.query[key]);
          } catch (e) {
            if (validate)
              throw new errors.BadRequest(
                `invalid address provided for "${key}"`,
                context.params.query,
              );
          }
        }
      });
    }
    return context;
  }

  const convertItem = item => {
    fieldNames.forEach(fieldName => {
      if (required && !item[fieldName])
        throw new errors.BadRequest(`"${fieldName} is a required field`);

      if (item[fieldName]) {
        try {
          // eslint-disable-next-line no-param-reassign
          item[fieldName] = toChecksumAddress(item[fieldName]);
        } catch (e) {
          if (validate)
            throw new errors.BadRequest(`invalid address provided for "${fieldName}"`, item);
        }
      }
    });
  };

  const items = commons.getItems(context);

  // items may be undefined if we are removing by id;
  if (items === undefined) return context;

  if (Array.isArray(items)) {
    items.forEach(item => convertItem(item));
  } else {
    convertItem(items);
  }

  commons.replaceItems(context, items);

  return context;
};
