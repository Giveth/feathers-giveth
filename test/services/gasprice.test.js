const assert = require('assert');
const app = require('../../src/app');

describe("'gasprice' service", () => {
  it('registered the service', () => {
    const service = app.service('gasprice');

    assert.ok(service, 'Registered the service');
  });
});
