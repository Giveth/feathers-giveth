const { assert } = require('chai');
const { getFeatherAppInstance } = require('../app');
const { SAMPLE_DATA, assertThrowsAsync } = require('../../test/testUtility');

let app;

function createEventTestCases() {
  it('should not allow to create events with reptetive transactionIndex, logIndex and blockNumber ', async () => {
    const eventService = app.service('events');
    const EventModel = eventService.Model;
    const eventData = SAMPLE_DATA.CREATE_EVENT_DATA;
    const result = await new EventModel(eventData).save();
    assert.isOk(result);
    const badFunc = async () => {
      await new EventModel(eventData).save();
    };
    await assertThrowsAsync(
      badFunc,
      `E11000 duplicate key error collection: giveth-test.events index: transactionIndex_1_blockNumber_1_logIndex_1 dup key: { transactionIndex: ${eventData.transactionIndex}, blockNumber: ${eventData.blockNumber}, logIndex: ${eventData.logIndex} }`,
    );
  });
}

describe('Create event testCases', createEventTestCases);

before(() => {
  app = getFeatherAppInstance();
});
