const request = require('supertest');
const config = require('config');
const { assert } = require('chai');
const { SAMPLE_DATA, generateRandomTxHash } = require('../../../test/testUtility');
const { getFeatherAppInstance } = require('../../app');

const baseUrl = config.get('givethFathersBaseUrl');
const relativeUrl = '/campaignTotalDonationValue';
let app;

before(() => {
  app = getFeatherAppInstance();
});

function GetTotalDonationAmountOfCampaignTestCases() {
  it('get projectInfo with right input data', async () => {
    const campaign = await app.service('campaigns').create({
      ...SAMPLE_DATA.CREATE_CAMPAIGN_DATA,
      status: SAMPLE_DATA.CAMPAIGN_STATUSES.ACTIVE,
    });
    const campaignId = String(campaign._id);
    const DonationModel = app.service('donations').Model;
    const firstDonationUsdValue = 150;
    const secondDonationUsdValue = 200;
    await new DonationModel({
      ...SAMPLE_DATA.DONATION_DATA,
      ownerTypeId: SAMPLE_DATA.TRACE_ID,
      campaignId,
      status: 'Waiting',
      usdValue: firstDonationUsdValue,
      txHash: generateRandomTxHash(),
      homeTxHash: generateRandomTxHash(),
    }).save();
    await new DonationModel({
      ...SAMPLE_DATA.DONATION_DATA,
      ownerTypeId: SAMPLE_DATA.TRACE_ID,
      campaignId,
      status: 'Waiting',
      usdValue: secondDonationUsdValue,
      txHash: generateRandomTxHash(),
      homeTxHash: generateRandomTxHash(),
    }).save();

    const response = await request(baseUrl).get(`${relativeUrl}/${campaignId}`);

    assert.equal(response.statusCode, 200);
    console.log('GetTotalDonationAmountOfCampaignTestCases() response.body', response.body);
    assert.equal(response.body.totalUsdValue, firstDonationUsdValue + secondDonationUsdValue);
  });
}

describe(`Test GET ${relativeUrl}`, GetTotalDonationAmountOfCampaignTestCases);
