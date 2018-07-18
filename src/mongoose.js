const mongoose = require('mongoose');
require('mongoose-long')(mongoose);
require('./models/mongoose-bn')(mongoose);
const logger = require('winston');

// mongoose query hook function that will
// remove the key from the doc if the value is undefined
function unsetUndefined(next) {
  const query = this;
  if (this.op === 'update') {
    Object.keys(this._update).forEach(k => {
      if (query._update[k] === undefined) {
        delete query._update[k];
        if (!query._update.$unset) query._update.$unset = {};
        query._update.$unset[k] = true;
      }
    });
  } else {
    logger.warn('mongoose hook ignoring unhandled `op`:', this.op, '\n', this);
  }
  next();
}

module.exports = function mongooseFactory() {
  const app = this;
  const mongoUrl = app.get('mongodb');

  logger.info('Using feathers mongo url', mongoUrl);

  mongoose.connect(mongoUrl);

  const db = mongoose.connection;
  db.on('error', err => logger.error('Could not connect to Mongo', err));
  db.once('open', () => logger.info('Connected to Mongo'));

  mongoose.plugin(schema => {
    // feathers-mongoose only uses the following 2 calls
    schema.pre('update', unsetUndefined);
    schema.pre('findOneAndUpdate', unsetUndefined);
  });

  mongoose.Promise = global.Promise;

  app.set('mongooseClient', mongoose);
};
