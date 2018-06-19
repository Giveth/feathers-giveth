const mongoose = require('mongoose');
const mongoUrl = 'mongodb://localhost:27017/giveth';
const Confirm = require('prompt-confirm');

new Confirm('Drop database?')
  .run()
  .then((reset) => {
    if(reset) {
      mongoose.connect(mongoUrl);
      const db = mongoose.connection;
      
      db.on('error', err => {
        console.error('Could not connect to Mongo', err)
        process.exit();
      });

      // once mongo connected, start migration
      db.once('open', () => {
        console.log('Connected to Mongo');

        db.dropDatabase().then((res) => {
          console.log('database dropped');
          process.exit();
        });
      });
    }
  });

