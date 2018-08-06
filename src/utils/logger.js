const logger = require('winston');

/**
 * configures the winston logger
 */
module.exports = function configureLogger() {
  logger.level = process.env.LOG_LEVEL || 'info';

  // replace log function to prettyPrint objects
  const origLog = logger.log;
  logger.log = (level, ...args) => {
    const newArgs = args.map(a => {
      if (typeof a === 'object') {
        // feathers attaches the hook to error
        // we don't want to log that b/c it is way to much info
        return a instanceof Error ? a.stack : JSON.stringify(a, null, 2);
      }

      return a;
    });

    return origLog(level, ...newArgs);
  };
};
