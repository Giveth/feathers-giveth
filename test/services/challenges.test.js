const assert = require('assert');
const app = require('../../src/app');

describe("'challenges' service", () => {
  it('registered the service', () => {
    const service = app.service('authentication/challenges');

    assert.ok(service, 'Registered the service');
  });
});
