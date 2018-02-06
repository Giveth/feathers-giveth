const assert = require('assert');
const app = require('../../src/app');

describe("'campaigns' service", () => {
  it('registered the service', () => {
    const service = app.service('campaigns');

    assert.ok(service, 'Registered the service');
  });
});
