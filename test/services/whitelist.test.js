const assert = require('assert');
const app = require('../../src/app');

describe("'whitelist' service", () => {
  it('registered the service', () => {
    const service = app.service('whitelist');

    assert.ok(service, 'Registered the service');
  });
});
