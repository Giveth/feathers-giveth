const mongoose = require('mongoose');
const config = require('config');

after(() => {
  console.log('dropping database', config.get('mongodb'));
  mongoose.connection.db.dropDatabase();
});
