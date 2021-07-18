const assert = require('assert');
const app = require('../../src/app');

describe("'communities' service", () => {
  it('registered the service', () => {
    const service = app.service('dacs');

    assert.ok(service, 'Registered the service');
  });
});
