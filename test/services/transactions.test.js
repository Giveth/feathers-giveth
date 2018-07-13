const assert = require('assert');
const app = require('../../src/app');

describe('\'transactions\' service', () => {
  it('registered the service', () => {
    const service = app.service('transactions');

    assert.ok(service, 'Registered the service');
  });
});
