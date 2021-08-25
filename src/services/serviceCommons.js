const defaultFeatherMongooseOptions = {
  multi: ['patch', 'remove'],
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
