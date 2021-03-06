const request = require('supertest');
const config = require('config');
const { assert } = require('chai');
const {
  capitalizeDelegateType,
  normalizeAmount,
  generateMilestoneCtaRelativeUrl,
  proposedMilestoneEdited,
} = require('./dappMailer');
const { EmailSubscribeTypes } = require('../models/emails.model');
const {
  generateRandomMongoId,
  SAMPLE_DATA,
  generateRandomEtheriumAddress,
  generateRandomNumber,
  getJwt,
  sleep,
} = require('../../test/testUtility');
const { getFeatherAppInstance } = require('../app');

const baseUrl = config.get('givethFathersBaseUrl');

let app;

before(() => {
  app = getFeatherAppInstance();
});

function normalizeAmountTestCases() {
  it('should 1700 turn to 0.0000000000000017', () => {
    const amount = '1700';
    const result = normalizeAmount(amount);
    assert.equal(result, 0.0000000000000017);
  });
  it('should 25000 turn to 0.000000000000025', () => {
    const amount = '25000';
    const result = normalizeAmount(amount);
    assert.equal(result, 0.000000000000025);
  });
}

function capitalizeDelegateTypeTestCases() {
  it('should convert dac to DAC', () => {
    const result = capitalizeDelegateType('dac');
    assert.equal(result, 'DAC');
  });
  it('should convert milestone to Milestone', () => {
    const result = capitalizeDelegateType('milestone');
    assert.equal(result, 'Milestone');
  });
  it('should convert campaign to Campaign', () => {
    const result = capitalizeDelegateType('campaign');
    assert.equal(result, 'Campaign');
  });
}
function generateMilestoneCtaRelativeUrlTestCases() {
  it('should generate milestoneUrl by campaignId and milestoneId', () => {
    const milestoneId = generateRandomMongoId();
    const campaignId = generateRandomMongoId();
    const url = generateMilestoneCtaRelativeUrl(campaignId, milestoneId);
    assert.equal(url, `/campaigns/${campaignId}/milestones/${milestoneId}`);
  });
}

const createMilestoneAndCampaign = async () => {
  const userService = app.service('users');
  const milestoneOwner = await userService.create({
    address: generateRandomEtheriumAddress(),
    email: `${generateRandomNumber(0, 10000)}-milestoneOwner@test.giveth`,
    isAdmin: true,
    name: `milestoneOwner ${generateRandomNumber(0, 10000)}`,
  });
  const campaignOwner = await userService.create({
    address: generateRandomEtheriumAddress(),
    email: `${generateRandomNumber(0, 10000)}-milestoneOwner@test.giveth`,
    isAdmin: true,
    name: `campaignOwner ${generateRandomNumber(0, 10000)}`,
  });

  const campaign = (
    await request(baseUrl)
      .post('/campaigns')
      .send({ ...SAMPLE_DATA.CREATE_CAMPAIGN_DATA, ownerAddress: campaignOwner.address })
      .set({ Authorization: getJwt(campaignOwner.address) })
  ).body;
  const milestone = (
    await request(baseUrl)
      .post('/milestones')
      .send({
        ...SAMPLE_DATA.CREATE_MILESTONE_DATA(),
        campaignId: campaign._id,
        ownerAddress: milestoneOwner.address,
        // owner: milestoneOwner,
      })
      .set({ Authorization: getJwt(milestoneOwner.address) })
  ).body;

  return { milestone, campaign, milestoneOwner, campaignOwner };
};

function proposedMilestoneEditedTestCases() {
  it('email to milestone owner after editing proposed milestone', async () => {
    const emailService = app.service('emails');
    const {
      campaign,
      milestone,
      milestoneOwner,
      campaignOwner,
    } = await createMilestoneAndCampaign();
    await proposedMilestoneEdited(app, {
      milestone,
      user: milestoneOwner,
    });

    // because creating and sending email is async, we should wait to make sure the email hooks worked
    await sleep(1000);
    const milestoneOwnerEmails = await emailService.find({
      paginate: false,
      query: {
        recipient: milestoneOwner.email,
        milestoneId: milestone._id,
        campaignId: campaign._id,
        unsubscribeType: EmailSubscribeTypes.PROPOSED_MILESTONE_EDITED,
      },
    });
    assert.isAtLeast(milestoneOwnerEmails.length, 1);

    // in this case should not send email to campaign manager
    const campaignOwnerEmails = await emailService.find({
      paginate: false,
      query: {
        recipient: campaignOwner.email,
        milestoneId: milestone._id,
        campaignId: campaign._id,
        unsubscribeType: EmailSubscribeTypes.PROPOSED_MILESTONE_EDITED,
      },
    });
    assert.equal(campaignOwnerEmails.length, 0);
  });
  it('email to milestone owner and campaign owner after campaign owners edits proposed milestone', async () => {
    const emailService = app.service('emails');
    const { campaign, milestone, milestoneOwner, campaignOwner } = await createMilestoneAndCampaign(
      app,
    );
    await proposedMilestoneEdited(app, {
      milestone,
      user: campaignOwner,
    });

    // because creating and sending email is async, we should wait to make sure the email hooks worked
    await sleep(1000);
    const milestoneOwnerEmails = await emailService.find({
      paginate: false,
      query: {
        recipient: milestoneOwner.email,
        milestoneId: milestone._id,
        campaignId: campaign._id,
        unsubscribeType: EmailSubscribeTypes.PROPOSED_MILESTONE_EDITED,
      },
    });
    assert.isAtLeast(milestoneOwnerEmails.length, 1);

    // in this case should not send email to campaign manager
    const campaignOwnerEmails = await emailService.find({
      paginate: false,
      query: {
        recipient: campaignOwner.email,
        milestoneId: milestone._id,
        campaignId: campaign._id,
        unsubscribeType: EmailSubscribeTypes.PROPOSED_MILESTONE_EDITED,
      },
    });
    assert.isAtLeast(campaignOwnerEmails.length, 1);
  });
}

describe('test normalizeAmount', normalizeAmountTestCases);
describe('test capitalizeDelegateType', capitalizeDelegateTypeTestCases);
describe('test generateMilestoneCtaRelativeUrl', generateMilestoneCtaRelativeUrlTestCases);
describe('test proposedMilestoneEdited', proposedMilestoneEditedTestCases);
