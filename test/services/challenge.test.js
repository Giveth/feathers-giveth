const assert = require('assert');
const app = require('../../src/app');

describe('\'challenge\' service', () => {
  it('registered the service', () => {
    const service = app.service('users/challenge');

    assert.ok(service, 'Registered the service');
  });
});
