const assert = require('assert');
const app = require('../../src/app');

describe('\'causes\' service', () => {
  it('registered the service', () => {
    const service = app.service('causes');

    assert.ok(service, 'Registered the service');
  });
});
