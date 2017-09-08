import NeDB from 'nedb';
import path from 'path';

export default (app) => {
  const dbPath = app.get('nedb');
  const Model = new NeDB({
    filename: path.join(dbPath, 'blockchain.db'),
    autoload: true
  });

  return Model;
};
