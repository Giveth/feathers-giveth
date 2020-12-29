import * as DailyRotateFile from 'winston-daily-rotate-file';
import * as winston from 'winston';

export const getLogger = (logDir : string, logLevel :'error'|'debug'|'info')=>{
  const winstonTransports = [];
  if (logDir) {
    winstonTransports.push(
      new DailyRotateFile({
        dirname: logDir,
        filename: 'simulation-error-%DATE%.log',
        maxFiles: '30d',
      }),
    );
  } else {
    winstonTransports.push(new winston.transports.Console());
  }

  return  winston.createLogger({
    level: logLevel,
    format: winston.format.simple(),
    transports: winstonTransports,
  });
}
