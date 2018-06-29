const assert = require('assert');
const app = require('../../src/app');

describe('\'conversations\' service', () => {
  it('registered the service', () => {
    const service = app.service('conversations');

    assert.ok(service, 'Registered the service');
  });
});
