const defaultFeatherMongooseOptions = {
  multi: ['patch'],
  whitelist: ['$exists', '$and', '$or', '$not', '$size'],
};

module.exports = {
  defaultFeatherMongooseOptions,
};
