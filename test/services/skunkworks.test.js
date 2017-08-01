const assert = require('assert');
const app = require('../../src/app');

describe('\'skunkworks\' service', () => {
  it('registered the service', () => {
    const service = app.service('skunkworks');

    assert.ok(service, 'Registered the service');
  });
});
