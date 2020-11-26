const { assert } = require('chai');
const { getFeatherAppInstance } = require('../app');
const giversFactory = require('./givers');
const mockLiquidPledging = require('../mock/mockLiquidPledging');
const { assertThrowsAsync, SAMPLE_DATA, generateRandomNumber } = require('../../test/testUtility');

let giver;

function addGiverTestCases() {
  it('should throw exception , invalid event passed', async () => {
    const badFunc = async () => {
      await giver.addGiver({ event: 'NotGiverAdded' });
    };
    await assertThrowsAsync(badFunc, 'addGiver only handles GiverAdded events');
  });

  it('should update user by eventData', async () => {
    const idGiver = generateRandomNumber(10, 100);
    const event = {
      returnValues: {
        idGiver,
      },
      event: 'GiverAdded',
    };
    const upsertedUser = await giver.addGiver(event);
    assert.equal(upsertedUser.giverId, idGiver);
  });
}

function updateGiverTestCases() {
  it('should throw exception , invalid event passed', async () => {
    const badFunc = async () => {
      await giver.updateGiver({ event: 'NotGiverUpdated' });
    };
    await assertThrowsAsync(badFunc, 'updateGiver only handles GiverUpdated events');
  });

  it('should update user by eventData', async () => {
    const idGiver = SAMPLE_DATA.USER_GIVER_ID;
    const event = {
      returnValues: {
        idGiver,
      },
      event: 'GiverUpdated',
    };
    const upsertedUser = await giver.updateGiver(event);
    assert.equal(upsertedUser.giverId, idGiver);
  });
}

describe('addGiver() function tests', addGiverTestCases);
describe('updateGiver() function tests', updateGiverTestCases);

before(() => {
  const app = getFeatherAppInstance();
  giver = giversFactory(app, mockLiquidPledging);
});
