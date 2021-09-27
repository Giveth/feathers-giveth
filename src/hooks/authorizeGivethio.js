const { NotAuthenticated } = require('@feathersjs/errors');
const config = require('config');
const { errorMessages } = require('../utils/errorMessages');

/**
 *
 * @param basicAuthentication  * @param basicAuthentication, something like this "Basic dXNlcm5hbWU6cGFzc3dvcmQ="
 * @returns {{password: string, username: string}} example {username:"username", password:"password"}
 */
const decodeBasicAuthentication = basicAuthentication => {
  const [username, password] = Buffer.from(basicAuthentication.split(' ')[1], 'base64')
    .toString()
    .split(':');
  return { username, password };
};

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
