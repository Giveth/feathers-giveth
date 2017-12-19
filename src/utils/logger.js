import logger from 'winston';

/**
 * configures the winston logger
 */
export default function () {
  logger.level = process.env.LOG_LEVEL || 'info';

  // replace log function to prettyPrint objects
  logger.origLog = logger.log;
  logger.log = function (level, ...args) {
    const newArgs = args.map((a) => {
      if (typeof a === 'object' && !(a instanceof Error)) {
        return JSON.stringify(a, null, 2);
      }

      return a;
    });

    return this.origLog(level, ...newArgs);
  };
}

