const { assert } = require('chai');
const { getSimilarTitleInTraceRegex } = require('./regexUtils');

const getSimilarTitleInTraceRegexTestCases = () => {
  it('should return false if there is character before title', () => {
    // this is a real case
    const title = 'Amin - Givether PAN Distribution';
    const regex = getSimilarTitleInTraceRegex(title);
    assert.isFalse(regex.test('RAmin - Givether PAN Distribution'));
  });

  it('should return true for same title', () => {
    const title = 'Amin - Givether PAN Distribution';
    const regex = getSimilarTitleInTraceRegex(title);
    assert.isTrue(regex.test('Amin - Givether PAN Distribution'));
  });

  it('should return true for same title with some spaces between words', () => {
    const title = 'Amin - Givether PAN Distribution';
    const titleWithSpace = 'Amin -  Givether   PAN   Distribution';
    const regex = getSimilarTitleInTraceRegex(titleWithSpace);
    assert.isTrue(regex.test(title));
  });
  it('should return true for same title with some spaces at end of title', () => {
    const title = 'Amin - Givether PAN Distribution';
    const titleWithSpace = 'Amin -  Givether   PAN   Distribution        ';
    const regex = getSimilarTitleInTraceRegex(titleWithSpace);
    assert.isTrue(regex.test(title));
  });

  it('should return false if there is character after the title', () => {
    // this is a real case
    const title = 'Amin - Givether PAN Distribution';
    const regex = getSimilarTitleInTraceRegex(title);
    assert.isFalse(regex.test('Amin - Givether PAN Distribution 2'));
  });
};
describe('getSimilarTitleInTraceRegex test cases', getSimilarTitleInTraceRegexTestCases);
