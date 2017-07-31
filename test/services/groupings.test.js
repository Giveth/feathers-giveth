const assert = require('assert');
const app = require('../../src/app');

describe('\'groupings\' service', () => {
  it('registered the service', () => {
    const service = app.service('groupings');

    assert.ok(service, 'Registered the service');
  });
});
