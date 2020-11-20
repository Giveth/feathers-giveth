const { assert } = require('chai');
const { getFeatherAppInstance } = require('../app');

const app = getFeatherAppInstance();

describe('register the user service', () => {
  it('should be ok', function() {
    const userService = app.service('users');
    assert.ok(userService, 'Registered the service');
  });
});
