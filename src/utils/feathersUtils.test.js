const { isRequestInternal } = require('./feathersUtils');
const { assert } = require('chai');

function isRequestInternalTestCases() {
  it('should return false ', function() {
    const isInternal = isRequestInternal({
      params: {
        provider: 'rest',
      },
    });
    assert.isFalse(isInternal);
  });

  it('should return true ', function() {
    const isInternal = isRequestInternal({
      params: {
        provider: undefined,
      },
    });
    assert.isTrue(isInternal);
  });
}

describe('isRequestInternal test cases', isRequestInternalTestCases);
