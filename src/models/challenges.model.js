const NeDB = require('nedb');
const path = require('path');

module.exports = function(app) {
  const dbPath = app.get('nedb');
  const Model = new NeDB({
    filename: path.join(dbPath, 'challenge.db'),
    autoload: true,
  });

  Model.ensureIndex({ fieldName: 'address', unique: true });

  return Model;
};
