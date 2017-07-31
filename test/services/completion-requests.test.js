const assert = require('assert');
const app = require('../../src/app');

describe('\'completion-requests\' service', () => {
  it('registered the service', () => {
    const service = app.service('completion-requests');

    assert.ok(service, 'Registered the service');
  });
});
