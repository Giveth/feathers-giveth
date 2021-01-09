const defaultFeatherMongooseOptions = {
  multi: ['patch'],
  whitelist: ['$exists', '$and', '$or', '$not', '$size', '$elemMatch'],
};

module.exports = {
  defaultFeatherMongooseOptions,
};
