const { NotAuthenticated } = require('@feathersjs/errors');
const config = require('config');
const { errorMessages } = require('../utils/errorMessages');
const { decodeBasicAuthentication } = require('../utils/basicAuthUtility');

const authorizeGivethio = context => {
  const { authorization } = context.params.headers;
  const { givethIoInfo } = config;
  if (!givethIoInfo || !authorization || !authorization.includes(' ')) {
    throw new NotAuthenticated();
  }
  const { username, password } = decodeBasicAuthentication(authorization);
  if (username !== givethIoInfo.username || password !== givethIoInfo.password) {
    throw new NotAuthenticated();
  }
  if (givethIoInfo.ip && givethIoInfo.ip !== context.params.headers['x-real-ip']) {
    throw new NotAuthenticated(errorMessages.INVALID_IP);
  }
  return context;
};

module.exports = {
  authorizeGivethio: () => context => authorizeGivethio(context),
};
