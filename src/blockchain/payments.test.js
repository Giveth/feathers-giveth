const { assert } = require('chai');
const { hexToNumberString } = require('web3-utils');
const { getFeatherAppInstance } = require('../app');
const paymentsFactory = require('./payments');
const { assertThrowsAsync, SAMPLE_DATA, generateRandomNumber } = require('../../test/testUtility');

let payments;
let app;

function authorizePaymentTestCases() {
  it('should throw exception , invalid event passed', async () => {
    const badFunc = async () => {
      await payments.authorizePayment({ event: 'NotAuthorizePayment' });
    };
    await assertThrowsAsync(badFunc, 'authorizePayment only handles AuthorizePayment events');
  });

  it('should update donation by eventData', async () => {
    const idPayment = generateRandomNumber(1, 10000);
    const ref = `0x00000000000000000000000000000000000000000000000000000000000${generateRandomNumber(
      10,
      99999,
    )}`;
    const event = {
      returnValues: {
        ref,
        idPayment,
      },
      event: 'AuthorizePayment',
    };
    const donationData = {
      amount: '1793698658625350941',
      amountRemaining: '9793698658625350941',
      giverAddress: SAMPLE_DATA.USER_ADDRESS,
      ownerId: 49,
      status: SAMPLE_DATA.DonationStatus.TO_APPROVE,
      ownerTypeId: SAMPLE_DATA.MILESTONE_ID,
      ownerType: 'milestone',
      pledgeId: hexToNumberString(ref),
      token: {
        name: 'ETH',
        address: '0x0',
        foreignAddress: '0xe3ee055346a9EfaF4AA2900847dEb04de0195398',
        symbol: 'ETH',
        decimals: '3',
      },
    };
    await app.service('donations').create(donationData);
    const updatedDonationsArray = await payments.authorizePayment(event);
    assert.isArray(updatedDonationsArray);
    assert.equal(updatedDonationsArray.length, 1);
    const updatedDonation = updatedDonationsArray[0];
    console.log('updatedDonation ', updatedDonation);
    assert.equal(updatedDonation.paymentId, idPayment);
  });

  it('should not update any donation by eventData, because no donation found with pledgeId', async () => {
    const idPayment = generateRandomNumber(1, 10000);
    const ref = `0x00000000000000000000000000000000000000000000000000000000000${generateRandomNumber(
      10,
      99999,
    )}`;
    const event = {
      returnValues: {
        ref,
        idPayment,
      },
      event: 'AuthorizePayment',
    };
    const updatedDonation = await payments.authorizePayment(event);
    assert.equal(updatedDonation, null);
  });
}

describe('authorizePayment() function tests', authorizePaymentTestCases);

before(() => {
  app = getFeatherAppInstance();
  payments = paymentsFactory(app);
});
