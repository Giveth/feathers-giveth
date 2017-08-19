import errors from 'feathers-errors';
import { checkContext, getByDot, setByDot } from 'feathers-hooks-common';
import { isAddress } from 'web3-utils';

// A hook that sanitizes ethereum addresses

export const sanitizeAddress = (...fieldNames) => {
  return context => {
    checkContext(context, 'before', [ 'create', 'update', 'patch' ]);

    fieldNames.forEach(fieldName => {
      const value = getByDot(context.data, fieldName);
      if (value !== undefined) {
        setByDot(context.data, fieldName, _sanitizeAddress(value));
      }
    });

    return context;
  };
};

const _sanitizeAddress = addr => {
  return (addr.toLowerCase().startsWith('0x')) ? addr : `0x${addr}`;
};

export const validateAddress = (...fieldNames) => {
  return context => {
    checkContext(context, 'before', [ 'create', 'update', 'patch' ]);

    fieldNames.forEach(fieldName => {
      const value = getByDot(context.data, fieldName);
      if (!isAddress(value)) {
        throw new errors.BadRequest(
          `Invalid address provided for field "${fieldName}": "${value}".`
        );
      }
    });

    return context;
  };
};
