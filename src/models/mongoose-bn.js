const utils = require('web3-utils');
const { Error: MongooseError } = require('mongoose');

module.exports = function NumberBN(mongoose) {
  const { Schema, SchemaType } = mongoose;
  const { Types } = mongoose;

  /**
   * MongoBN constructor
   *
   * @inherits SchemaType
   * @param {String} key
   * @param {Object} [options]
   */

  function BN(key, options) {
    SchemaType.call(this, key, options);
  }

  /*!
   * inherits
   */

  Object.setPrototypeOf(BN.prototype, SchemaType.prototype);

  /**
   * Implement checkRequired method.
   *
   * @param {any} val
   * @return {Boolean}
   */

  BN.prototype.checkRequired = function checkRequired(val) {
    return val != null;
  };

  BN.prototype.min = function min(value, message) {
    if (this.minValidator) {
      this.validators = this.validators.filter(v => v.validator !== this.minValidator, this);
    }

    if (value !== null && value !== undefined) {
      let msg = message || MongooseError.messages.Number.min;
      msg = msg.replace(/{MIN}/, value);
      this.validators.push({
        validator: (this.minValidator = function minValidator(v) {
          return v == null || utils.toBN(v).gten(value);
        }),
        message: msg,
        type: 'min',
        min: value,
      });
    }

    return this;
  };

  /**
   * Implement casting.
   *
   * @param {any} val
   * @param {Object} [scope]
   * @param {Boolean} [init]
   * @return {BN|null}
   */

  BN.prototype.cast = function cast(val, scope, init) {
    if (val === null || val === undefined) return undefined;
    if (val === '') return undefined;

    if (val instanceof utils.BN) return init ? val : val.toString();

    if (!Array.isArray(val) && val.toString) {
      return init ? utils.toBN(val.toString()) : val.toString();
    }

    throw new SchemaType.CastError('MongoBN', val);
  };

  /*!
   * ignore
   */

  // disallow the following b/c we can't safely handle BN in mongo
  const ignoreOperators = ['$lt', '$lte', '$gt', '$gte', '$mod'];

  /**
   * Implement query casting, for mongoose 3.0
   *
   * @param {String} $conditional
   * @param {*} [value]
   */

  BN.prototype.castForQuery = function castForQuery($conditional, value) {
    let handler;
    if (arguments.length === 2) {
      handler = this.$conditionalHandlers[$conditional];
      if (ignoreOperators.includes($conditional) || !handler) {
        throw new Error(`Can't use ${$conditional} with MongoBN.`);
      }
      return handler.call(this, value);
    }
    return this.cast($conditional);
  };

  /**
   * Expose
   */

  Schema.Types.BN = BN;
  Types.BN = utils.BN;
  return BN;
};
