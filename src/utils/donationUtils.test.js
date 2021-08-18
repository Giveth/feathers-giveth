const { assert } = require('chai');
const { getFeatherAppInstance } = require('../app');
const {
  SAMPLE_DATA,
  generateRandomTxHash,
  generateRandomMongoId,
} = require('../../test/testUtility');
const { isDonationBackToOriginalCampaign } = require('./donationUtils');

let app;

before(() => {
  app = getFeatherAppInstance();
});

function isDonationBackToOriginalCampaignTests() {
  it('should return true', async () => {
    const DonationModel = app.service('donations').Model;
    const grandFatherDonation = await new DonationModel({
      ...SAMPLE_DATA.DONATION_DATA,
      ownerTypeId: SAMPLE_DATA.CAMPAIGN_ID,
      ownerType: 'campaign',
      status: SAMPLE_DATA.DonationStatus.COMMITTED,
      txHash: generateRandomTxHash(),
    }).save();

    const fatherDonation = await new DonationModel({
      ...SAMPLE_DATA.DONATION_DATA,
      parentDonations: [String(grandFatherDonation._id)],
      status: SAMPLE_DATA.DonationStatus.PAID,
      txHash: generateRandomTxHash(),
    }).save();
    const childDonationData = {
      ownerType: 'campaign',
      parentDonations: [String(fatherDonation._id)],
      status: SAMPLE_DATA.DonationStatus.COMMITTED,
      ownerTypeId: SAMPLE_DATA.CAMPAIGN_ID,
    };

    const isReturn = await isDonationBackToOriginalCampaign(app, childDonationData);

    assert.isTrue(isReturn);
  });
  it('should return false when parent donation is not Paid or Committed', async () => {
    const DonationModel = app.service('donations').Model;
    const grandFatherDonation = await new DonationModel({
      ...SAMPLE_DATA.DONATION_DATA,
      ownerTypeId: SAMPLE_DATA.CAMPAIGN_ID,
      ownerType: 'campaign',
      status: SAMPLE_DATA.DonationStatus.COMMITTED,
      txHash: generateRandomTxHash(),
    }).save();

    const nonPaidStatus = [
      SAMPLE_DATA.DonationStatus.PAYING,
      SAMPLE_DATA.DonationStatus.TO_APPROVE,
      SAMPLE_DATA.DonationStatus.REJECTED,
      SAMPLE_DATA.DonationStatus.CANCELED,
      SAMPLE_DATA.DonationStatus.WAITING,
    ];
    // eslint-disable-next-line no-restricted-syntax
    for (const status of nonPaidStatus) {
      // eslint-disable-next-line no-await-in-loop
      const fatherDonation = await new DonationModel({
        ...SAMPLE_DATA.DONATION_DATA,
        parentDonations: [String(grandFatherDonation._id)],
        status,
        txHash: generateRandomTxHash(),
      }).save();
      const childDonationData = {
        ownerType: 'campaign',
        parentDonations: [String(fatherDonation._id)],
        status: SAMPLE_DATA.DonationStatus.COMMITTED,
        ownerTypeId: SAMPLE_DATA.CAMPAIGN_ID,
      };
      // eslint-disable-next-line no-await-in-loop
      const isReturn = await isDonationBackToOriginalCampaign(app, childDonationData);
      assert.isFalse(isReturn, `should return false for status: ${status}`);
    }
  });

  it('should return false for non Committed status', async () => {
    const DonationModel = app.service('donations').Model;
    const grandFatherDonation = await new DonationModel({
      ...SAMPLE_DATA.DONATION_DATA,
      ownerTypeId: SAMPLE_DATA.CAMPAIGN_ID,
      ownerType: 'campaign',
      status: SAMPLE_DATA.DonationStatus.COMMITTED,
      txHash: generateRandomTxHash(),
    }).save();

    const fatherDonation = await new DonationModel({
      ...SAMPLE_DATA.DONATION_DATA,
      parentDonations: [String(grandFatherDonation._id)],
      status: SAMPLE_DATA.DonationStatus.PAID,
      txHash: generateRandomTxHash(),
    }).save();

    const nonCommittedStatus = [
      SAMPLE_DATA.DonationStatus.PAYING,
      SAMPLE_DATA.DonationStatus.PAID,
      SAMPLE_DATA.DonationStatus.TO_APPROVE,
      SAMPLE_DATA.DonationStatus.REJECTED,
      SAMPLE_DATA.DonationStatus.CANCELED,
      SAMPLE_DATA.DonationStatus.WAITING,
    ];
    // eslint-disable-next-line no-restricted-syntax
    for (const status of nonCommittedStatus) {
      const childDonationData = {
        ownerType: 'campaign',
        parentDonations: [String(fatherDonation._id)],
        status,
        ownerTypeId: SAMPLE_DATA.CAMPAIGN_ID,
      };
      // eslint-disable-next-line no-await-in-loop
      const isReturn = await isDonationBackToOriginalCampaign(app, childDonationData);
      assert.isFalse(isReturn, `should return false for status: ${status}`);
    }
  });
  it('should return false for when donation ownerType is not campaign', async () => {
    const DonationModel = app.service('donations').Model;
    const grandFatherDonation = await new DonationModel({
      ...SAMPLE_DATA.DONATION_DATA,
      ownerTypeId: SAMPLE_DATA.CAMPAIGN_ID,
      ownerType: 'campaign',
      status: SAMPLE_DATA.DonationStatus.COMMITTED,
      txHash: generateRandomTxHash(),
    }).save();

    const fatherDonation = await new DonationModel({
      ...SAMPLE_DATA.DONATION_DATA,
      parentDonations: [String(grandFatherDonation._id)],
      status: SAMPLE_DATA.DonationStatus.PAID,
      txHash: generateRandomTxHash(),
    }).save();

    const childDonationData = {
      ownerType: 'trace',
      parentDonations: [String(fatherDonation._id)],
      status: SAMPLE_DATA.DonationStatus.COMMITTED,
      ownerTypeId: SAMPLE_DATA.CAMPAIGN_ID,
    };
    const isReturn = await isDonationBackToOriginalCampaign(app, childDonationData);
    assert.isFalse(isReturn);
  });
  it('should return false for when donations grandparent ownerType is not campaign', async () => {
    const DonationModel = app.service('donations').Model;
    const grandFatherDonation = await new DonationModel({
      ...SAMPLE_DATA.DONATION_DATA,
      ownerTypeId: SAMPLE_DATA.CAMPAIGN_ID,
      ownerType: 'trace',
      status: SAMPLE_DATA.DonationStatus.COMMITTED,
      txHash: generateRandomTxHash(),
    }).save();

    const fatherDonation = await new DonationModel({
      ...SAMPLE_DATA.DONATION_DATA,
      parentDonations: [String(grandFatherDonation._id)],
      status: SAMPLE_DATA.DonationStatus.PAID,
      txHash: generateRandomTxHash(),
    }).save();

    const childDonationData = {
      ownerType: 'campaign',
      parentDonations: [String(fatherDonation._id)],
      status: SAMPLE_DATA.DonationStatus.COMMITTED,
      ownerTypeId: SAMPLE_DATA.CAMPAIGN_ID,
    };
    const isReturn = await isDonationBackToOriginalCampaign(app, childDonationData);
    assert.isFalse(isReturn);
  });
  it('should return false for when donations grandparent ownerTypeId is not equal to donation ownerTypeId', async () => {
    const DonationModel = app.service('donations').Model;
    const grandFatherDonation = await new DonationModel({
      ...SAMPLE_DATA.DONATION_DATA,
      ownerTypeId: generateRandomMongoId(),
      ownerType: 'campaign',
      status: SAMPLE_DATA.DonationStatus.COMMITTED,
      txHash: generateRandomTxHash(),
    }).save();

    const fatherDonation = await new DonationModel({
      ...SAMPLE_DATA.DONATION_DATA,
      parentDonations: [String(grandFatherDonation._id)],
      status: SAMPLE_DATA.DonationStatus.PAID,
      txHash: generateRandomTxHash(),
    }).save();

    const childDonationData = {
      ownerType: 'campaign',
      parentDonations: [String(fatherDonation._id)],
      status: SAMPLE_DATA.DonationStatus.COMMITTED,
      ownerTypeId: SAMPLE_DATA.CAMPAIGN_ID,
    };
    const isReturn = await isDonationBackToOriginalCampaign(app, childDonationData);
    assert.isFalse(isReturn);
  });
}

describe(`isDonationBackToOriginalCampaign test cases`, isDonationBackToOriginalCampaignTests);
