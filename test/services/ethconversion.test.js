const assert = require('assert');
const app = require('../../src/app');

describe('\'ethconversion\' service', () => {
  it('registered the service', () => {
    const service = app.service('ethconversion');

    assert.ok(service, 'Registered the service');
  });
});
