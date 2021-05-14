const { assert } = require('chai');
const { getFeatherAppInstance } = require('../app');
const { SAMPLE_DATA, generateRandomTxHash } = require('../../test/testUtility');
const {
  updateBridgePaymentExecutedTxHash,
  updateBridgePaymentAuthorizedTxHash,
  isAllDonationsPaidOutForMilestoneAndTxHash,
} = require('./donationRepository');

let app;

before(() => {
  app = getFeatherAppInstance();
});

function updateBridgePaymentExecutedTxHashTests() {
  it('should update bridgeStatus and paymentExecutedTxHash', async () => {
    const txHash = generateRandomTxHash();
    const DonationModel = app.service('donations').Model;
    await new DonationModel({
      ...SAMPLE_DATA.DONATION_DATA,
      ownerTypeId: SAMPLE_DATA.MILESTONE_ID,
      status: 'Paid',
      txHash,
    }).save();
    await new DonationModel({
      ...SAMPLE_DATA.DONATION_DATA,
      ownerTypeId: SAMPLE_DATA.MILESTONE_ID,
      status: 'Paid',
      txHash,
    }).save();
    const bridgePaymentExecutedTxHash = generateRandomTxHash();
    await updateBridgePaymentExecutedTxHash(app, {
      txHash,
      bridgePaymentExecutedTxHash,
      bridgePaymentExecutedTime: new Date(),
    });
    const donations = await app.service('donations').find({
      paginate: false,
      status: 'Paid',
      query: {
        txHash,
      },
    });
    assert.equal(donations.length, 2);
    assert.equal(donations[0].bridgePaymentExecutedTxHash, bridgePaymentExecutedTxHash);
    assert.equal(donations[0].bridgeStatus, 'Paid');
    assert.equal(donations[1].bridgePaymentExecutedTxHash, bridgePaymentExecutedTxHash);
    assert.equal(donations[1].bridgeStatus, 'Paid');
  });
}
function updateBridgePaymentAuthorizedTxHashTests() {
  it('should update paymentAuthorizedTxHash', async () => {
    const txHash = generateRandomTxHash();
    const DonationModel = app.service('donations').Model;
    await new DonationModel({
      ...SAMPLE_DATA.DONATION_DATA,
      ownerTypeId: SAMPLE_DATA.MILESTONE_ID,
      status: 'Paid',
      txHash,
    }).save();
    await new DonationModel({
      ...SAMPLE_DATA.DONATION_DATA,
      ownerTypeId: SAMPLE_DATA.MILESTONE_ID,
      status: 'Paid',
      txHash,
    }).save();
    const bridgePaymentAuthorizedTxHash = generateRandomTxHash();
    await updateBridgePaymentAuthorizedTxHash(app, {
      txHash,
      bridgePaymentAuthorizedTxHash,
    });
    const donations = await app.service('donations').find({
      paginate: false,
      status: 'Paid',
      query: {
        txHash,
      },
    });
    assert.equal(donations.length, 2);
    assert.equal(donations[0].bridgePaymentAuthorizedTxHash, bridgePaymentAuthorizedTxHash);
    assert.equal(donations[1].bridgePaymentAuthorizedTxHash, bridgePaymentAuthorizedTxHash);
  });
}
function isAllDonationsPaidOutForMilestoneAndTxHashTests() {
  it('should return false,  when all donations are not paid out', async () => {
    const txHash = generateRandomTxHash();
    const DonationModel = app.service('donations').Model;
    await new DonationModel({
      ...SAMPLE_DATA.DONATION_DATA,
      ownerTypeId: SAMPLE_DATA.MILESTONE_ID,
      status: 'Paid',
      txHash,
      bridgePaymentExecutedTxHash: generateRandomTxHash(),
    }).save();
    await new DonationModel({
      ...SAMPLE_DATA.DONATION_DATA,
      ownerTypeId: SAMPLE_DATA.MILESTONE_ID,
      status: 'Paid',
      txHash,
    }).save();
    const isAllDonationsPaidOut = await isAllDonationsPaidOutForMilestoneAndTxHash(app, {
      txHash,
      milestoneId: SAMPLE_DATA.MILESTONE_ID,
    });
    assert.isFalse(isAllDonationsPaidOut);
  });
  it('should return true  when all donations are paid out', async () => {
    const txHash = generateRandomTxHash();
    const DonationModel = app.service('donations').Model;
    await new DonationModel({
      ...SAMPLE_DATA.DONATION_DATA,
      ownerTypeId: SAMPLE_DATA.MILESTONE_ID,
      status: 'Paid',
      txHash,
      bridgePaymentExecutedTxHash: generateRandomTxHash(),
    }).save();
    await new DonationModel({
      ...SAMPLE_DATA.DONATION_DATA,
      ownerTypeId: SAMPLE_DATA.MILESTONE_ID,
      status: 'Paid',
      txHash,
      bridgePaymentExecutedTxHash: generateRandomTxHash(),
    }).save();
    const isAllDonationsPaidOut = await isAllDonationsPaidOutForMilestoneAndTxHash(app, {
      txHash,
      milestoneId: SAMPLE_DATA.MILESTONE_ID,
    });
    assert.isTrue(isAllDonationsPaidOut);
  });
}
describe(`updateBridgePaymentExecutedTxHash test cases`, updateBridgePaymentExecutedTxHashTests);
describe(
  `updateBridgePaymentAuthorizedTxHash test cases`,
  updateBridgePaymentAuthorizedTxHashTests,
);

describe(
  `isAllDonationsPaidOutForMilestoneAndTxHash test cases`,
  isAllDonationsPaidOutForMilestoneAndTxHashTests,
);
