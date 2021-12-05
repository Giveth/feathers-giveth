const { assert } = require('chai');
const { decodeBasicAuthentication, createBasicAuthentication } = require('./basicAuthUtility');

function createBasicAuthenticationTestCases() {
  it('should return basic auth for username, password', () => {
    const username = 'username';
    const password = 'password';
    assert.equal(
      createBasicAuthentication({ username, password }),
      'Basic dXNlcm5hbWU6cGFzc3dvcmQ=',
    );
  });
}
function decodeBasicAuthenticationTestCases() {
  it('should return basic auth for username, password', () => {
    const { username, password } = decodeBasicAuthentication('Basic dXNlcm5hbWU6cGFzc3dvcmQ=');
    assert.equal(username, 'username');
    assert.equal(password, 'password');
  });
}
describe('createBasicAuthentication() test cases', createBasicAuthenticationTestCases);
describe('decodeBasicAuthentication() test cases', decodeBasicAuthenticationTestCases);
