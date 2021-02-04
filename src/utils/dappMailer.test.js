const { assert } = require('chai');
const { capitalizeDelegateType, normalizeAmount } = require('./dappMailer');

function normalizeAmountTestCases() {
  it('should 1700 turn to 0.0000000000000017', function() {
    const amount = '1700';
    const result = normalizeAmount(amount);
    assert.equal(result, 0.0000000000000017);
  });
  it('should 25000 turn to 0.000000000000025', function() {
    const amount = '25000';
    const result = normalizeAmount(amount);
    assert.equal(result, 0.000000000000025);
  });
}

function capitalizeDelegateTypeTestCases() {
  it('should convert dac to DAC', function() {
    const result = capitalizeDelegateType('dac');
    assert.equal(result, 'DAC');
  });
  it('should convert milestone to Milestone', function() {
    const result = capitalizeDelegateType('milestone');
    assert.equal(result, 'Milestone');
  });
  it('should convert campaign to Campaign', function() {
    const result = capitalizeDelegateType('campaign');
    assert.equal(result, 'Campaign');
  });
}

describe('test normalizeAmount', normalizeAmountTestCases);
describe('test capitalizeDelegateType', capitalizeDelegateTypeTestCases);
