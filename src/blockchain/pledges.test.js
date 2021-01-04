const { getFeatherAppInstance } = require('../app');
const pledgesFactory = require('./pledges');
const mockLiquidPledging = require('../mock/mockLiquidPledging');
const { assertThrowsAsync, generateRandomNumber } = require('../../test/testUtility');

let pledges;

function transferTestCases() {
  it('should throw exception , invalid event passed', async () => {
    const badFunc = async () => {
      await pledges.transfer({ event: 'NotTransfer' });
    };
    await assertThrowsAsync(badFunc, 'transfer only handles Transfer events');
  });

  it('should throw exception, connecting to web3 problem in test mode', async () => {
    const event = {
      blockNumber: 1,
      returnValues: {
        from: String(generateRandomNumber(1, 1000)),
        to: String(generateRandomNumber(1, 1000)),
        amount: '400000000000000000',
      },
      event: 'Transfer',
    };
    const badFunc = async () => {
      await pledges.transfer(event);
    };
    await assertThrowsAsync(badFunc, 'Hash value cannot be undefined');
  });
}

describe('transfer() function tests', transferTestCases);

before(() => {
  const app = getFeatherAppInstance();
  pledges = pledgesFactory(app, mockLiquidPledging);
});
