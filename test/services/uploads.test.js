const assert = require('assert');
const app = require('../../src/app');

describe('\'uploads\' service', () => {
  it('registered the service', () => {
    const service = app.service('uploads');

    assert.ok(service, 'Registered the service');
  });
});
