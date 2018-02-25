const assert = require('assert');
const app = require('../../src/app');

describe("'donations' service", () => {
  it('registered the service', () => {
    const service = app.service('donations');

    assert.ok(service, 'Registered the service');
  });
});
