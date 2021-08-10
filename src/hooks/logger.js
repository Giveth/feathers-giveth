// A hook that logs service method before, after and error
const logger = require('winston');
const Sentry = require('@sentry/node');
const config = require('config');
const { isRequestInternal } = require('../utils/feathersUtils');

const startMonitoring = () => context => {
  /**
   * inspired by official sentry middleware for express
   * @see{@link https://github.com/getsentry/sentry-javascript/blob/ab0bc9313a798403dbaeae1e3d867cdf7841d6e4/packages/node/src/handlers.ts#L62-L93}
   */
  // Add monitoring for external requests
  if (
    !config.enableSentryMonitoring ||
    isRequestInternal(context) ||
    // internal calls that use the external context doesnt have headers
    !context.params.headers ||
    // for requests that use _populate it will fill after first call
    context.params._populate
  )
    return context;
  const transaction = Sentry.startTransaction({
    name: `${context.path}-${context.method}`,
    method: context.method,
    op: context.params.provider,
  });
  // const span = transaction.startChild({
  //   data: {
  //   },
  //   op: 'task',
  //   description: `processing shopping cart result`,
  // });
  context.__sentry_transaction = transaction;
  return context;
};

const responseLoggerHook = () => {
  return function log(hook) {
    let message = `${hook.type}: ${hook.path} - Method: ${hook.method}`;
    const sentryTransaction = hook.__sentry_transaction;
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
    // I think when hook.params._populate is equal to 'skip` it means we have internal calls
    // that use an extenral call context
    if (sentryTransaction && !hook.params._populate) {
      // Maybe statusCode is not 200 and be 201 but in this state AFAIK we dont have access to statusCode here
      // So I set the 200 for success request
      const statusCode = hook.error ? hook.error.code : 200;
      sentryTransaction.setHttpStatus(statusCode);
      sentryTransaction.finish();
    }

    if (hook.error) {
      const e = hook.error;

      // for making sure the feathers errors like unAuthorized wouldn't capture as exceptions
      if (e.type !== 'FeathersError') {
        Sentry.captureException(e, {
          user: hook.params.user,
        });
      }
      delete e.hook;

      if (hook.path === 'authentication') {
        logger.debug(e);
      } else if (hook.error.name === 'NotFound') {
        logger.info(`${hook.path} - ${hook.error.message}`);
      } else {
        logger.error('Hook error:', e);
      }
    }
  };
};

module.exports = { responseLoggerHook, startMonitoring };
