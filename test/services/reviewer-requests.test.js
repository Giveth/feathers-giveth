const assert = require('assert');
const app = require('../../src/app');

describe('\'reviewer-requests\' service', () => {
  it('registered the service', () => {
    const service = app.service('reviewer-requests');

    assert.ok(service, 'Registered the service');
  });
});
