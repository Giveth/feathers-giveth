const { assert, expect } = require('chai');
const { getFeatherAppInstance } = require('../app');
const queryGasPrice = require('./gasPriceService');

// const { assertThrowsAsync, SAMPLE_DATA, generateRandomNumber } = require('../../test/testUtility');
let app;

function queryGasPriceTestCases() {
  it('should get gas prices from ethgasstation.info and set to config', async () => {
    const data = await queryGasPrice();
    assert.isOk(data);
    assert.exists(data.fast);
    assert.exists(data.fastest);
    assert.exists(data.average);
    expect(data).to.deep.equal(app.get('gasPrice'));
  });
}

describe('queryGasPrice() function tests', queryGasPriceTestCases);

before(() => {
  app = getFeatherAppInstance();
});
