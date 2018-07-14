// A hook that logs service method before, after and error
const logger = require('winston');

module.exports = function loggerFactory() {
  return function log(hook) {
    let message = `${hook.type}: ${hook.path} - Method: ${hook.method}`;

    if (hook.type === 'error') {
      message += ` - ${hook.error.message}`;
    }

    if (hook.params.provider && hook.type !== 'error') {
      logger.debug(message);
    } else if (hook.params.provider && hook.type === 'error') {
      logger.info(message);
    } else {
      logger.debug(`INTERNAL_CALL -> ${message}`);
    }
    logger.debug('hook.data', hook.data);
    logger.debug('hook.params', hook.params);

    if (hook.result) {
      logger.debug('hook.result', hook.result);
    }

    if (hook.error) {
      const e = hook.error;
      delete e.hook;

      if (hook.path === 'authentication') {
        logger.debug(e);
      } else if (hook.error.name === 'NotFound') {
        logger.info(`${hook.path} - ${hook.error.message}`);
      } else {
        logger.error(e);
      }
    }
  };
};
