const assert = require('assert');
const app = require('../../src/app');

describe("'conversionRates' service", () => {
  it('registered the service', () => {
    const service = app.service('conversionRates');

    assert.ok(service, 'Registered the service');
  });
});
