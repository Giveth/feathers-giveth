const defaultFeatherMongooseOptions = {
  multi: ['patch'],
  whitelist: [
    '$exists',
    '$and',
    '$or',
    '$not',
    '$size',
    '$elemMatch',
    '$regex',
    '$options',
    '$text',
    '$search',
    '$meta',
  ],
};

module.exports = {
  defaultFeatherMongooseOptions,
};
