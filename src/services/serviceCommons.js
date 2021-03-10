const defaultFeatherMongooseOptions = {
  multi: ['patch'],
  whitelist: ['$exists', '$and', '$or', '$not', '$size', '$elemMatch', '$regex', '$options'],
};

module.exports = {
  defaultFeatherMongooseOptions,
};
