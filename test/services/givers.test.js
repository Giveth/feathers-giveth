const assert = require('assert');
const app = require('../../src/app');

describe('\'givers\' service', () => {
  it('registered the service', () => {
    const service = app.service('givers');

    assert.ok(service, 'Registered the service');
  });
});
