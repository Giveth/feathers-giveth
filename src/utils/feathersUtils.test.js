const { assert } = require('chai');
const { isRequestInternal } = require('./feathersUtils');

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
