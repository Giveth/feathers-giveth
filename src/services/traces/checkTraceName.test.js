const {
  assertThrowsAsync,
  assertNotThrowsAsync,
  SAMPLE_DATA,
  generateRandomMongoId,
} = require('../../../test/testUtility');
const { getFeatherAppInstance } = require('../../app');

const checkTraceName = require('./checkTraceName');

let app;
before(() => {
  app = getFeatherAppInstance();
});

const checkTraceNameTestCases = () => {
  it('should throw error for repetitive title', async () => {
    const traceData = {
      ...SAMPLE_DATA.createTraceData(),
      title: 'test-trace-unique',
      ownerAddress: SAMPLE_DATA.USER_ADDRESS,
    };
    await app.service('traces').create(traceData);
    const context = {
      id: generateRandomMongoId(),
      app,
      data: {
        title: traceData.title,
        campaignId: traceData.campaignId,
      },
    };
    const badFunc = async () => {
      await checkTraceName()(context);
    };
    await assertThrowsAsync(
      badFunc,
      'Trace title is repetitive. Please select a different title for the trace.',
    );
  });
  it('should not throw error for repetitive title but different campaign', async () => {
    const traceData = {
      ...SAMPLE_DATA.createTraceData(),
      ownerAddress: SAMPLE_DATA.USER_ADDRESS,
    };
    await app.service('traces').create(traceData);

    const context = {
      id: generateRandomMongoId(),
      app,
      data: {
        title: traceData.title,
        campaignId: generateRandomMongoId(),
      },
    };
    const goodFunc = async () => {
      await checkTraceName()(context);
    };
    await assertNotThrowsAsync(goodFunc);
  });
  it('should not throw error for similar title with extra spaces between words', async () => {
    const title = 'test repetetive title with space between words';
    const titleWithExtraSpaces = 'test    repetetive   title    with   space    between  words';
    const traceData = {
      ...SAMPLE_DATA.createTraceData(),
      title,
      ownerAddress: SAMPLE_DATA.USER_ADDRESS,
    };
    await app.service('traces').create(traceData);

    const context = {
      id: generateRandomMongoId(),
      app,
      data: {
        title: titleWithExtraSpaces,
        campaignId: generateRandomMongoId(),
      },
    };
    const goodFunc = async () => {
      await checkTraceName()(context);
    };
    await assertNotThrowsAsync(goodFunc);
  });
  it('should not throw error for similar title with extra spaces at end of title', async () => {
    const title = 'test repetetive title with extra spaces at end of title';
    const titleWithExtraSpaces =
      'test    repetetive   title  with extra spaces at end of title       ';
    const traceData = {
      ...SAMPLE_DATA.createTraceData(),
      title,
      ownerAddress: SAMPLE_DATA.USER_ADDRESS,
    };
    await app.service('traces').create(traceData);

    const context = {
      id: generateRandomMongoId(),
      app,
      data: {
        title: titleWithExtraSpaces,
        campaignId: generateRandomMongoId(),
      },
    };
    const goodFunc = async () => {
      await checkTraceName()(context);
    };
    await assertNotThrowsAsync(goodFunc);
  });
};

describe('test checkTraceName() functions', checkTraceNameTestCases);
