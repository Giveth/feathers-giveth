const request = require('supertest');
const config = require('config');
const { assert } = require('chai');
const {
  capitalizeDelegateType,
  normalizeAmount,
  generateMilestoneCtaRelativeUrl,
  proposedMilestoneEdited,
  milestoneProposed,
  proposedMilestoneAccepted,
  proposedMilestoneRejected,
  milestoneRequestReview,
  milestoneReviewRejected,
  milestoneMarkedCompleted,
  milestoneCanceled,
  donationsCollected,
} = require('./dappMailer');
const { EmailSubscribeTypes } = require('../models/emails.model');
const {
  generateRandomMongoId,
  SAMPLE_DATA,
  generateRandomEtheriumAddress,
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
    email: `${new Date().getTime()}-milestoneOwner@test.giveth`,
    isAdmin: true,
    name: `milestoneOwner ${new Date()}`,
  });
  const milestoneReviewer = await userService.create({
    address: generateRandomEtheriumAddress(),
    email: `${new Date().getTime()}-milestoneReviewer@test.giveth`,
    isAdmin: true,
    isReviewer: true,
    name: `milestoneReviewer ${new Date()}`,
  });
  const campaignOwner = await userService.create({
    address: generateRandomEtheriumAddress(),
    email: `${new Date().getTime()}-campaignOwner@test.giveth`,
    isAdmin: true,
    name: `campaignOwner ${new Date()}`,
  });
  const dacOwner = await userService.create({
    address: generateRandomEtheriumAddress(),
    email: `${new Date().getTime()}-dacOwner@test.giveth`,
    isAdmin: true,
    name: `dacOwner ${new Date()}`,
  });
  const campaignReviewer = await userService.create({
    address: generateRandomEtheriumAddress(),
    email: `${new Date().getTime()}-campaignReviewer@test.giveth`,
    isAdmin: true,
    name: `campaignReviewer ${new Date()}`,
  });
  const milestoneRecipient = await userService.create({
    address: generateRandomEtheriumAddress(),
    email: `${new Date().getTime()}-milestoneRecipient@test.giveth`,
    name: `milestoneRecipient ${new Date()}`,
  });

  const campaign = (
    await request(baseUrl)
      .post('/campaigns')
      .send({
        ...SAMPLE_DATA.CREATE_CAMPAIGN_DATA,
        ownerAddress: campaignOwner.address,
        reviewerAddress: campaignReviewer.address,
      })
      .set({ Authorization: getJwt(campaignOwner.address) })
  ).body;
  const milestone = (
    await request(baseUrl)
      .post('/milestones')
      .send({
        ...SAMPLE_DATA.createMilestoneData(),
        campaignId: campaign._id,
        ownerAddress: milestoneOwner.address,
        reviewerAddress: milestoneReviewer.address,
        recipientAddress: milestoneRecipient.address,
        // owner: milestoneOwner,
      })
      .set({ Authorization: getJwt(milestoneOwner.address) })
  ).body;

  // const dac = (
  //   await request(baseUrl)
  //     .post('/dacs')
  //     .send({
  //       ...SAMPLE_DATA.CREATE_DAC_DATA,
  //       ownerAddress: dacOwner.address,
  //       campaigns: [campaign._id],
  //     })
  //     .set({ Authorization: getJwt(dacOwner.address) })
  // ).body;
  await request(baseUrl)
    .post('/dacs')
    .send({
      ...SAMPLE_DATA.CREATE_DAC_DATA,
      ownerAddress: dacOwner.address,
      campaigns: [campaign._id],
    })
    .set({ Authorization: getJwt(dacOwner.address) });

  return {
    milestone,
    campaign,
    milestoneOwner,
    campaignOwner,
    campaignReviewer,
    milestoneReviewer,
    milestoneRecipient,
    dacOwner,
  };
};

function proposedMilestoneEditedTestCases() {
  it('email to milestone owner and campaign owner after editing proposed milestone', async () => {
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
    await sleep(50);
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
    await sleep(50);
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
  it('email to campaign owner after milestone reviewer edits proposed milestone', async () => {
    const emailService = app.service('emails');
    const {
      campaign,
      milestone,
      milestoneReviewer,
      campaignOwner,
    } = await createMilestoneAndCampaign();
    await proposedMilestoneEdited(app, {
      milestone,
      user: milestoneReviewer,
    });
    // because creating and sending email is async, we should wait to make sure the email hooks worked
    await sleep(50);

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

function milestoneProposedTestCases() {
  it('email to campaignOwner after milestone proposed', async () => {
    const emailService = app.service('emails');
    const { campaign, milestone, campaignOwner } = await createMilestoneAndCampaign();
    await milestoneProposed(app, {
      milestone,
    });
    // because creating and sending email is async, we should wait to make sure the email hooks worked
    await sleep(50);
    const campaignOwnerEmails = await emailService.find({
      paginate: false,
      query: {
        recipient: campaignOwner.email,
        milestoneId: milestone._id,
        campaignId: campaign._id,
        unsubscribeType: EmailSubscribeTypes.MILESTONE_PROPOSED,
      },
    });
    assert.isAtLeast(campaignOwnerEmails.length, 1);
  });
  it('email to  milestoneReviewer after milestone proposed', async () => {
    const emailService = app.service('emails');
    const { campaign, milestone, milestoneReviewer } = await createMilestoneAndCampaign();
    await milestoneProposed(app, {
      milestone,
    });
    // because creating and sending email is async, we should wait to make sure the email hooks worked
    await sleep(50);

    const milestoneReviewerEmails = await emailService.find({
      paginate: false,
      query: {
        recipient: milestoneReviewer.email,
        milestoneId: milestone._id,
        campaignId: campaign._id,
        unsubscribeType: EmailSubscribeTypes.MILESTONE_PROPOSED,
      },
    });
    assert.isAtLeast(milestoneReviewerEmails.length, 1);
  });
  it('email to milestoneOwner after milestone proposed', async () => {
    const emailService = app.service('emails');
    const { campaign, milestone, milestoneOwner } = await createMilestoneAndCampaign();
    await milestoneProposed(app, {
      milestone,
    });
    // because creating and sending email is async, we should wait to make sure the email hooks worked
    await sleep(50);

    const milestoneOwnerEmails = await emailService.find({
      paginate: false,
      query: {
        recipient: milestoneOwner.email,
        milestoneId: milestone._id,
        campaignId: campaign._id,
        unsubscribeType: EmailSubscribeTypes.MILESTONE_PROPOSED,
      },
    });
    assert.isAtLeast(milestoneOwnerEmails.length, 1);
  });
}

function proposedMilestoneAcceptedTestCases() {
  it('email to milestoneOwner, after proposed Milestone Accepted', async () => {
    const emailService = app.service('emails');
    const { campaign, milestone, milestoneOwner } = await createMilestoneAndCampaign();
    const message = `test message - ${new Date()}`;
    await proposedMilestoneAccepted(app, {
      milestone,
      message,
    });
    // because creating and sending email is async, we should wait to make sure the email hooks worked
    await sleep(50);

    const milestoneOwnerEmails = await emailService.find({
      paginate: false,
      query: {
        recipient: milestoneOwner.email,
        milestoneId: milestone._id,
        campaignId: campaign._id,
        unsubscribeType: EmailSubscribeTypes.PROPOSED_MILESTONE_ACCEPTED,
      },
    });
    assert.isAtLeast(milestoneOwnerEmails.length, 1);
    assert.equal(milestoneOwnerEmails[0].message, message);
  });
  it('email to milestoneRecipient, after proposed Milestone Accepted', async () => {
    const emailService = app.service('emails');
    const { campaign, milestone, milestoneRecipient } = await createMilestoneAndCampaign();
    const message = `test message - ${new Date()}`;
    await proposedMilestoneAccepted(app, {
      milestone,
      message,
    });
    // because creating and sending email is async, we should wait to make sure the email hooks worked
    await sleep(50);
    const recipientEmails = await emailService.find({
      paginate: false,
      query: {
        recipient: milestoneRecipient.email,
        milestoneId: milestone._id,
        campaignId: campaign._id,
        unsubscribeType: EmailSubscribeTypes.MILESTONE_CREATED,
      },
    });
    assert.isAtLeast(recipientEmails.length, 1);
    assert.equal(recipientEmails[0].message, message);
  });
}

function proposedMilestoneRejectedTestCases() {
  it('email to milestoneOwner, when proposed milestone rejected', async () => {
    const emailService = app.service('emails');
    const { campaign, milestone, milestoneOwner } = await createMilestoneAndCampaign();
    const message = `test message - ${new Date()}`;
    await proposedMilestoneRejected(app, {
      milestone,
      message,
    });
    // because creating and sending email is async, we should wait to make sure the email hooks worked
    await sleep(50);
    const milestoneOwnerEmails = await emailService.find({
      paginate: false,
      query: {
        recipient: milestoneOwner.email,
        milestoneId: milestone._id,
        campaignId: campaign._id,
        unsubscribeType: EmailSubscribeTypes.PROPOSED_MILESTONE_REJECTED,
      },
    });
    assert.isAtLeast(milestoneOwnerEmails.length, 1);
    assert.equal(milestoneOwnerEmails[0].message, message);
  });
}

function milestoneRequestReviewTestCases() {
  it('email to milestoneReviewer, when proposed milestone requested for review', async () => {
    const emailService = app.service('emails');
    const { campaign, milestone, milestoneReviewer } = await createMilestoneAndCampaign();
    const message = `test message - ${new Date()}`;
    await milestoneRequestReview(app, {
      milestone,
      message,
    });
    // because creating and sending email is async, we should wait to make sure the email hooks worked
    await sleep(50);
    const milestoneReviewerEmails = await emailService.find({
      paginate: false,
      query: {
        recipient: milestoneReviewer.email,
        milestoneId: milestone._id,
        campaignId: campaign._id,
        unsubscribeType: EmailSubscribeTypes.MILESTONE_REQUEST_REVIEW,
      },
    });
    assert.isAtLeast(milestoneReviewerEmails.length, 1);
    assert.equal(milestoneReviewerEmails[0].message, message);
  });
}

function milestoneReviewRejectedTestCases() {
  it('email to milestoneOwner, when proposed milestone rejected', async () => {
    const emailService = app.service('emails');
    const { campaign, milestone, milestoneOwner } = await createMilestoneAndCampaign();
    const message = `test message - ${new Date()}`;
    await milestoneReviewRejected(app, {
      milestone,
      message,
    });
    // because creating and sending email is async, we should wait to make sure the email hooks worked
    await sleep(50);
    const milestoneOwnerEmails = await emailService.find({
      paginate: false,
      query: {
        recipient: milestoneOwner.email,
        milestoneId: milestone._id,
        campaignId: campaign._id,
        unsubscribeType: EmailSubscribeTypes.MILESTONE_REVIEW_REJECTED,
      },
    });
    assert.isAtLeast(milestoneOwnerEmails.length, 1);
    assert.equal(milestoneOwnerEmails[0].message, message);
  });
}

function milestoneCanceledTestCases() {
  it('email to milestoneOwner, when proposed milestone marks as complete', async () => {
    const emailService = app.service('emails');
    const { campaign, milestone, milestoneOwner } = await createMilestoneAndCampaign();
    const message = `test message - ${new Date()}`;
    await milestoneCanceled(app, {
      milestone,
      message,
    });
    // because creating and sending email is async, we should wait to make sure the email hooks worked
    await sleep(50);
    const milestoneOwnerEmails = await emailService.find({
      paginate: false,
      query: {
        recipient: milestoneOwner.email,
        milestoneId: milestone._id,
        campaignId: campaign._id,
        unsubscribeType: EmailSubscribeTypes.MILESTONE_CANCELLED,
      },
    });
    assert.isAtLeast(milestoneOwnerEmails.length, 1);
    assert.equal(milestoneOwnerEmails[0].message, message);
  });
}

const milestoneMarkedCompletedTestCases = () => {
  const message = `test message - ${new Date()}`;

  it('email to milestoneRecipient, when proposed milestone marks as complete', async () => {
    const emailService = app.service('emails');
    const { campaign, milestone, milestoneRecipient } = await createMilestoneAndCampaign();
    await milestoneMarkedCompleted(app, {
      milestone,
      message,
    });
    await sleep(50);

    const milestoneRecipientEmails = await emailService.find({
      paginate: false,
      query: {
        recipient: milestoneRecipient.email,
        milestoneId: milestone._id,
        campaignId: campaign._id,
        message,
        unsubscribeType: EmailSubscribeTypes.MILESTONE_REVIEW_APPROVED,
      },
    });
    assert.isAtLeast(milestoneRecipientEmails.length, 1);
  });
  it('email to milestoneReviewer, when proposed milestone marks as complete', async () => {
    const emailService = app.service('emails');
    const { campaign, milestone, milestoneReviewer } = await createMilestoneAndCampaign();
    await milestoneMarkedCompleted(app, {
      milestone,
      message,
    });
    await sleep(50);

    const milestoneReviewerEmails = await emailService.find({
      paginate: false,
      query: {
        recipient: milestoneReviewer.email,
        milestoneId: milestone._id,
        campaignId: campaign._id,
        message,
        unsubscribeType: EmailSubscribeTypes.MILESTONE_REVIEW_APPROVED,
      },
    });
    assert.isAtLeast(milestoneReviewerEmails.length, 1);
  });
  it('email to campaignOwner, when proposed milestone marks as complete', async () => {
    const emailService = app.service('emails');
    const { campaign, milestone, campaignOwner } = await createMilestoneAndCampaign();
    await milestoneMarkedCompleted(app, {
      milestone,
      message,
    });
    await sleep(50);

    const campaignOwnerEmails = await emailService.find({
      paginate: false,
      query: {
        recipient: campaignOwner.email,
        milestoneId: milestone._id,
        campaignId: campaign._id,
        message,
        unsubscribeType: EmailSubscribeTypes.MILESTONE_REVIEW_APPROVED,
      },
    });
    assert.isAtLeast(campaignOwnerEmails.length, 1);
  });
  it('email to campaignReviewer, when proposed milestone marks as complete', async () => {
    const emailService = app.service('emails');
    const { campaign, milestone, campaignReviewer } = await createMilestoneAndCampaign();
    await milestoneMarkedCompleted(app, {
      milestone,
      message,
    });
    await sleep(50);

    const campaignReviewerEmails = await emailService.find({
      paginate: false,
      query: {
        recipient: campaignReviewer.email,
        milestoneId: milestone._id,
        campaignId: campaign._id,
        message,
        unsubscribeType: EmailSubscribeTypes.MILESTONE_REVIEW_APPROVED,
      },
    });
    assert.isAtLeast(campaignReviewerEmails.length, 1);
  });
  it('email to dacOwner, when proposed milestone marks as complete', async () => {
    const emailService = app.service('emails');
    const { campaign, milestone, dacOwner } = await createMilestoneAndCampaign();
    await milestoneMarkedCompleted(app, {
      milestone,
      message,
    });
    await sleep(50);

    const dacOwnerEmails = await emailService.find({
      paginate: false,
      query: {
        recipient: dacOwner.email,
        milestoneId: milestone._id,
        campaignId: campaign._id,
        unsubscribeType: EmailSubscribeTypes.MILESTONE_REVIEW_APPROVED,
      },
    });
    assert.isAtLeast(dacOwnerEmails.length, 1);
  });

  it('email to milestoneOwner, when proposed milestone marks as complete', async () => {
    const emailService = app.service('emails');

    const { campaign, milestone, milestoneOwner } = await createMilestoneAndCampaign();

    await milestoneMarkedCompleted(app, {
      milestone,
      message,
    });
    // because creating and sending email is async, we should wait to make sure the email hooks worked
    await sleep(50);
    const milestoneOwnerEmails = await emailService.find({
      paginate: false,
      query: {
        recipient: milestoneOwner.email,
        milestoneId: milestone._id,
        message,
        campaignId: campaign._id,
        unsubscribeType: EmailSubscribeTypes.MILESTONE_REVIEW_APPROVED,
      },
    });
    assert.isAtLeast(milestoneOwnerEmails.length, 1);
  });
};

function donationsCollectedTestCases() {
  it('email to milestoneOwner, when proposed milestone marks as complete', async () => {
    const emailService = app.service('emails');
    const { campaign, milestone, milestoneRecipient } = await createMilestoneAndCampaign();
    await donationsCollected(app, {
      milestone,
      conversation: {
        payments: [
          {
            amount: '100000000000000000',
            symbol: 'ETH',
          },
        ],
      },
    });
    // because creating and sending email is async, we should wait to make sure the email hooks worked
    await sleep(50);
    const milestoneRecipientEmails = await emailService.find({
      paginate: false,
      query: {
        recipient: milestoneRecipient.email,
        milestoneId: milestone._id,
        campaignId: campaign._id,
        unsubscribeType: EmailSubscribeTypes.DONATIONS_COLLECTED,
      },
    });
    assert.isAtLeast(milestoneRecipientEmails.length, 1);
  });
}

describe('test normalizeAmount', normalizeAmountTestCases);
describe('test capitalizeDelegateType', capitalizeDelegateTypeTestCases);
describe('test generateMilestoneCtaRelativeUrl', generateMilestoneCtaRelativeUrlTestCases);
describe('test proposedMilestoneEdited', proposedMilestoneEditedTestCases);
describe('test milestoneProposed', milestoneProposedTestCases);
describe('test proposedMilestoneAccepted', proposedMilestoneAcceptedTestCases);
describe('test proposedMilestoneRejected', proposedMilestoneRejectedTestCases);
describe('test milestoneRequestReview', milestoneRequestReviewTestCases);
describe('test milestoneReviewRejected', milestoneReviewRejectedTestCases);
describe('test milestoneReviewRejected', milestoneReviewRejectedTestCases);
describe('test milestoneMarkedCompleted', milestoneMarkedCompletedTestCases);
describe('test milestoneCanceled', milestoneCanceledTestCases);
describe('test donationsCollected', donationsCollectedTestCases);
