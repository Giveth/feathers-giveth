const { Buffer } = require('buffer');
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

/**
 *
 * @param username example: "username"
 * @param password example: "password"
 * @returns {`Basic ${string}`} example: "Basic dXNlcm5hbWU6cGFzc3dvcmQ="
 */
const createBasicAuthentication = ({ username, password }) => {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
};

module.exports = {
  decodeBasicAuthentication,
  createBasicAuthentication,
};
