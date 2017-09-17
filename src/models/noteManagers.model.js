import NeDB from 'nedb';
import path from 'path';

export default (app) => {
  const dbPath = app.get('nedb');
  const Model = new NeDB({
    filename: path.join(dbPath, 'noteManagers.db'),
    autoload: true
  });

  Model.ensureIndex({ fieldName: 'id', unique: true });

  return Model;
};
