const NeDB = require('nedb');
const path = require('path');

module.exports = function (app) {
  const dbPath = app.get('nedb');
  const Model = new NeDB({
    filename: path.join(dbPath, 'givers.db'),
    autoload: true
  });

  Model.ensureIndex({ fieldName: 'email', unique: true });

  return Model;
};
