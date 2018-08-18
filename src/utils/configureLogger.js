const path = require('path');
const winston = require('winston');
require('winston-daily-rotate-file');
const { SPLAT } = require('triple-beam');

const customFormatter = winston.format((info, opts) => {
  let { message } = info;
  // winston stores extra params passed to log functions
  // in the SPLAT Symbol
  const splat = info[SPLAT] || [];

  if (opts.prettyPrint) {
    splat.forEach(s => {
      message += ' ';

      if (typeof s === 'object') {
        message += s instanceof Error ? s.stack : JSON.stringify(s, null, 2);
      } else {
        message += s;
      }

      message += ' ';
    });
    message += '';
  }

  // return FeathersError before removing splat keys
  if (info.type === 'FeathersError') return info;

  // splat keys are appended to the info object by default, we want to remove them
  Object.keys(info)
    .filter(k => !['level', 'message'].includes(k))
    .forEach(k => delete info[k]);

  if (!opts.prettyPrint && splat.length > 0) {
    info.params = splat;
  }

  info.message = message;
  return info;
});

/**
 * configures the winston logger
 */
module.exports = function configureLogger() {
  const app = this;
  const level = process.env.LOG_LEVEL || 'info';

  const { simple, combine } = winston.format;

  const config = {
    level,
    transports: [
      new winston.transports.Console({
        format: combine(customFormatter({ prettyPrint: true }), simple()),
        handleExceptions: true,
      }),
    ],
    exitOnError: false,
  };

  const logDir = app.get('logDir');

  if (logDir) {
    // - Write all logs error (and below) to `error.log`.
    config.transports.push(
      new winston.transports.DailyRotateFile({
        dirname: logDir,
        filename: 'error-%DATE%.log',
        level: 'error',
        maxFiles: '30d',
      }),
    );
    // - Write to all logs with level `info` and below to `combined.log`
    config.transports.push(
      new winston.transports.DailyRotateFile({
        dirname: logDir,
        filename: 'combined-%DATE%.log',
        maxFiles: '30d',
      }),
    );
    // - Write to uncaught exceptions to `exceptions.log`
    config.exceptionHandlers = [
      new winston.transports.File({ filename: path.join(logDir, 'exceptions.log') }),
    ];

    const { json, timestamp } = winston.format;
    config.format = combine(customFormatter(), timestamp(), json());
  }

  winston.configure(config);
};
