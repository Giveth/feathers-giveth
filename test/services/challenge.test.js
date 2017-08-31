const assert = require('assert');
const app = require('../../src/app');

describe('\'challenge\' service', () => {
  it('registered the service', () => {
    const service = app.service('authentication/challenge');

    assert.ok(service, 'Registered the service');
  });
});
