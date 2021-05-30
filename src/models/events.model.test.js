const { assert } = require('chai');
const { getFeatherAppInstance } = require('../app');
const { SAMPLE_DATA, assertThrowsAsync } = require('../../test/testUtility');

let app;

function createEventTestCases() {
  it('should not allow to create events with repetitive transactionIndex, logIndex and blockNumber ', async () => {
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
      `E11000 duplicate key error collection: giveth-test.events index: isHomeEvent_1_blockNumber_1_transactionIndex_1_logIndex_1 dup key: { isHomeEvent: ${eventData.isHomeEvent}, blockNumber: ${eventData.blockNumber}, transactionIndex: ${eventData.transactionIndex}, logIndex: ${eventData.logIndex} }`,
    );
  });
}

describe('Create event testCases', createEventTestCases);

before(() => {
  app = getFeatherAppInstance();
});
