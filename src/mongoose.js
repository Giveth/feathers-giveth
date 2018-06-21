const mongoose = require('mongoose');
const logger = require('winston');

module.exports = function () {
  const app = this;
  const mongoUrl = app.get('mongodb');

  logger.info('Using feathers mongo url', mongoUrl);

  let promise =  mongoose.connect(mongoUrl);

  const db = mongoose.connection;
  db.on('error', (err) => logger.error('Could not connect to Mongo', err) );
  db.once('open', () => logger.info('Connected to Mongo') );

  mongoose.Promise = global.Promise;

  app.set('mongooseClient', mongoose);
};