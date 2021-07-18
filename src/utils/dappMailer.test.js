const request = require('supertest');
const config = require('config');
const { assert } = require('chai');
const {
  capitalizeDelegateType,
  normalizeAmount,
  generateTraceCtaRelativeUrl,
  proposedTraceEdited,
  traceProposed,
  proposedTraceAccepted,
  proposedTraceRejected,
  traceRequestReview,
  traceReviewRejected,
  traceMarkedCompleted,
  traceCancelled,
  donationsCollected,
  traceReceivedDonation,
  moneyWentToRecipientWallet,
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
  it('should convert community to COMMUNITY', () => {
    const result = capitalizeDelegateType('community');
    assert.equal(result, 'Community');
  });
  it('should convert trace to Trace', () => {
    const result = capitalizeDelegateType('trace');
    assert.equal(result, 'Trace');
  });
  it('should convert campaign to Campaign', () => {
    const result = capitalizeDelegateType('campaign');
    assert.equal(result, 'Campaign');
  });
}

function generateTraceCtaRelativeUrlTestCases() {
  it('should generate traceUrl by campaignId and traceId', () => {
    const traceId = generateRandomMongoId();
    const campaignId = generateRandomMongoId();
    const url = generateTraceCtaRelativeUrl(campaignId, traceId);
    assert.equal(url, `/campaigns/${campaignId}/traces/${traceId}`);
  });
}

const createTraceAndCampaign = async () => {
  const userService = app.service('users');
  const traceOwner = await userService.create({
    address: generateRandomEtheriumAddress(),
    email: `${new Date().getTime()}-traceOwner@test.giveth`,
    isAdmin: true,
    name: `traceOwner ${new Date()}`,
  });
  const traceReviewer = await userService.create({
    address: generateRandomEtheriumAddress(),
    email: `${new Date().getTime()}-traceReviewer@test.giveth`,
    isAdmin: true,
    isReviewer: true,
    name: `traceReviewer ${new Date()}`,
  });
  const campaignOwner = await userService.create({
    address: generateRandomEtheriumAddress(),
    email: `${new Date().getTime()}-campaignOwner@test.giveth`,
    isAdmin: true,
    name: `campaignOwner ${new Date()}`,
  });
  const communityOwner = await userService.create({
    address: generateRandomEtheriumAddress(),
    email: `${new Date().getTime()}-communityOwner@test.giveth`,
    isAdmin: true,
    name: `communityOwner ${new Date()}`,
  });
  const communitySubscriber = await userService.create({
    address: generateRandomEtheriumAddress(),
    email: `${new Date().getTime()}-communitySubscriber@test.giveth`,
    isAdmin: true,
    name: `communitySubscriber ${new Date()}`,
  });
  const campaignSubscriber = await userService.create({
    address: generateRandomEtheriumAddress(),
    email: `${new Date().getTime()}-campaignSubscriber@test.giveth`,
    isAdmin: true,
    name: `campaignSubscriber ${new Date()}`,
  });
  const campaignReviewer = await userService.create({
    address: generateRandomEtheriumAddress(),
    email: `${new Date().getTime()}-campaignReviewer@test.giveth`,
    isAdmin: true,
    name: `campaignReviewer ${new Date()}`,
  });
  const traceRecipient = await userService.create({
    address: generateRandomEtheriumAddress(),
    email: `${new Date().getTime()}-traceRecipient@test.giveth`,
    name: `traceRecipient ${new Date()}`,
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
  const trace = (
    await request(baseUrl)
      .post('/traces')
      .send({
        ...SAMPLE_DATA.createTraceData(),
        campaignId: campaign._id,
        ownerAddress: traceOwner.address,
        reviewerAddress: traceReviewer.address,
        recipientAddress: traceRecipient.address,
        // owner: traceOwner,
      })
      .set({ Authorization: getJwt(traceOwner.address) })
  ).body;

  const community = (
    await request(baseUrl)
      .post('/communities')
      .send({
        ...SAMPLE_DATA.CREATE_COMMUNITY_DATA,
        ownerAddress: communityOwner.address,
        campaigns: [campaign._id],
      })
      .set({ Authorization: getJwt(communityOwner.address) })
  ).body;

  await app
    .service('subscriptions')
    .Model({
      userAddress: communitySubscriber.address,
      projectType: 'community',
      projectTypeId: String(community._id),
      enabled: true,
    })
    .save();

  await app
    .service('subscriptions')
    .Model({
      userAddress: campaignSubscriber.address,
      projectType: 'campaign',
      projectTypeId: String(campaign._id),
      enabled: true,
    })
    .save();

  return {
    trace,
    campaign,
    traceOwner,
    campaignOwner,
    campaignReviewer,
    traceReviewer,
    traceRecipient,
    communityOwner,
    communitySubscriber,
    campaignSubscriber,
  };
};

function proposedTraceEditedTestCases() {
  it('email to trace owner and campaign owner after editing proposed trace', async () => {
    const emailService = app.service('emails');
    const { campaign, trace, traceOwner, campaignOwner } = await createTraceAndCampaign();
    await proposedTraceEdited(app, {
      trace,
      user: traceOwner,
    });

    // because creating and sending email is async, we should wait to make sure the email hooks worked
    await sleep(50);
    const traceOwnerEmails = await emailService.find({
      paginate: false,
      query: {
        recipient: traceOwner.email,
        traceId: trace._id,
        campaignId: campaign._id,
        unsubscribeType: EmailSubscribeTypes.PROPOSED_MILESTONE_EDITED,
      },
    });
    assert.isAtLeast(traceOwnerEmails.length, 1);

    // in this case should not send email to campaign manager
    const campaignOwnerEmails = await emailService.find({
      paginate: false,
      query: {
        recipient: campaignOwner.email,
        traceId: trace._id,
        campaignId: campaign._id,
        unsubscribeType: EmailSubscribeTypes.PROPOSED_MILESTONE_EDITED,
      },
    });
    assert.equal(campaignOwnerEmails.length, 0);
  });
  it('email to trace owner and campaign owner after campaign owners edits proposed trace', async () => {
    const emailService = app.service('emails');
    const { campaign, trace, traceOwner, campaignOwner } = await createTraceAndCampaign(app);
    await proposedTraceEdited(app, {
      trace,
      user: campaignOwner,
    });

    // because creating and sending email is async, we should wait to make sure the email hooks worked
    await sleep(50);
    const traceOwnerEmails = await emailService.find({
      paginate: false,
      query: {
        recipient: traceOwner.email,
        traceId: trace._id,
        campaignId: campaign._id,
        unsubscribeType: EmailSubscribeTypes.PROPOSED_MILESTONE_EDITED,
      },
    });
    assert.isAtLeast(traceOwnerEmails.length, 1);

    // in this case should not send email to campaign manager
    const campaignOwnerEmails = await emailService.find({
      paginate: false,
      query: {
        recipient: campaignOwner.email,
        traceId: trace._id,
        campaignId: campaign._id,
        unsubscribeType: EmailSubscribeTypes.PROPOSED_MILESTONE_EDITED,
      },
    });
    assert.isAtLeast(campaignOwnerEmails.length, 1);
  });
  it('email to campaign owner after trace reviewer edits proposed trace', async () => {
    const emailService = app.service('emails');
    const { campaign, trace, traceReviewer, campaignOwner } = await createTraceAndCampaign();
    await proposedTraceEdited(app, {
      trace,
      user: traceReviewer,
    });
    // because creating and sending email is async, we should wait to make sure the email hooks worked
    await sleep(50);

    const campaignOwnerEmails = await emailService.find({
      paginate: false,
      query: {
        recipient: campaignOwner.email,
        traceId: trace._id,
        campaignId: campaign._id,
        unsubscribeType: EmailSubscribeTypes.PROPOSED_MILESTONE_EDITED,
      },
    });
    assert.isAtLeast(campaignOwnerEmails.length, 1);
  });
}

function traceProposedTestCases() {
  it('email to campaignOwner after trace proposed', async () => {
    const emailService = app.service('emails');
    const { campaign, trace, campaignOwner } = await createTraceAndCampaign();
    await traceProposed(app, {
      trace,
    });
    // because creating and sending email is async, we should wait to make sure the email hooks worked
    await sleep(50);
    const campaignOwnerEmails = await emailService.find({
      paginate: false,
      query: {
        recipient: campaignOwner.email,
        traceId: trace._id,
        campaignId: campaign._id,
        unsubscribeType: EmailSubscribeTypes.MILESTONE_PROPOSED,
      },
    });
    assert.isAtLeast(campaignOwnerEmails.length, 1);
  });
  it('email to  traceReviewer after trace proposed', async () => {
    const emailService = app.service('emails');
    const { campaign, trace, traceReviewer } = await createTraceAndCampaign();
    await traceProposed(app, {
      trace,
    });
    // because creating and sending email is async, we should wait to make sure the email hooks worked
    await sleep(50);

    const traceReviewerEmails = await emailService.find({
      paginate: false,
      query: {
        recipient: traceReviewer.email,
        traceId: trace._id,
        campaignId: campaign._id,
        unsubscribeType: EmailSubscribeTypes.MILESTONE_PROPOSED,
      },
    });
    assert.isAtLeast(traceReviewerEmails.length, 1);
  });
  it('email to traceOwner after trace proposed', async () => {
    const emailService = app.service('emails');
    const { campaign, trace, traceOwner } = await createTraceAndCampaign();
    await traceProposed(app, {
      trace,
    });
    // because creating and sending email is async, we should wait to make sure the email hooks worked
    await sleep(50);

    const traceOwnerEmails = await emailService.find({
      paginate: false,
      query: {
        recipient: traceOwner.email,
        traceId: trace._id,
        campaignId: campaign._id,
        unsubscribeType: EmailSubscribeTypes.MILESTONE_PROPOSED,
      },
    });
    assert.isAtLeast(traceOwnerEmails.length, 1);
  });
}

function proposedTraceAcceptedTestCases() {
  it('email to traceOwner, after proposed Trace Accepted', async () => {
    const emailService = app.service('emails');
    const { campaign, trace, traceOwner } = await createTraceAndCampaign();
    const message = `test message - ${new Date()}`;
    await proposedTraceAccepted(app, {
      trace,
      message,
    });
    // because creating and sending email is async, we should wait to make sure the email hooks worked
    await sleep(50);

    const traceOwnerEmails = await emailService.find({
      paginate: false,
      query: {
        recipient: traceOwner.email,
        traceId: trace._id,
        campaignId: campaign._id,
        unsubscribeType: EmailSubscribeTypes.PROPOSED_MILESTONE_ACCEPTED,
      },
    });
    assert.isAtLeast(traceOwnerEmails.length, 1);
    assert.equal(traceOwnerEmails[0].message, message);
  });
  it('email to traceRecipient, after proposed Trace Accepted', async () => {
    const emailService = app.service('emails');
    const { campaign, trace, traceRecipient } = await createTraceAndCampaign();
    const message = `test message - ${new Date()}`;
    await proposedTraceAccepted(app, {
      trace,
      message,
    });
    // because creating and sending email is async, we should wait to make sure the email hooks worked
    await sleep(50);
    const recipientEmails = await emailService.find({
      paginate: false,
      query: {
        recipient: traceRecipient.email,
        traceId: trace._id,
        campaignId: campaign._id,
        unsubscribeType: EmailSubscribeTypes.MILESTONE_CREATED,
      },
    });
    assert.isAtLeast(recipientEmails.length, 1);
    assert.equal(recipientEmails[0].message, message);
  });
  it('email to campaigns parent community subscriber, after proposed Trace Accepted', async () => {
    const emailService = app.service('emails');
    const { campaign, trace, communitySubscriber } = await createTraceAndCampaign();
    const message = `test message - ${new Date()}`;
    await proposedTraceAccepted(app, {
      trace,
      message,
    });
    // because creating and sending email is async, we should wait to make sure the email hooks worked
    await sleep(50);
    const communitySubscriberEmails = await emailService.find({
      paginate: false,
      query: {
        recipient: communitySubscriber.email,
        traceId: trace._id,
        campaignId: campaign._id,
        unsubscribeType: EmailSubscribeTypes.PROPOSED_MILESTONE_ACCEPTED,
      },
    });
    assert.isAtLeast(communitySubscriberEmails.length, 1);
    assert.equal(communitySubscriberEmails[0].message, message);
  });
  it('email to campaigns subscriber, after proposed Trace Accepted', async () => {
    const emailService = app.service('emails');
    const { campaign, trace, campaignSubscriber } = await createTraceAndCampaign();
    const message = `test message - ${new Date()}`;
    await proposedTraceAccepted(app, {
      trace,
      message,
    });
    // because creating and sending email is async, we should wait to make sure the email hooks worked
    await sleep(50);
    const communitySubscriberEmails = await emailService.find({
      paginate: false,
      query: {
        recipient: campaignSubscriber.email,
        traceId: trace._id,
        campaignId: campaign._id,
        unsubscribeType: EmailSubscribeTypes.PROPOSED_MILESTONE_ACCEPTED,
      },
    });
    assert.isAtLeast(communitySubscriberEmails.length, 1);
    assert.equal(communitySubscriberEmails[0].message, message);
  });
}

function proposedTraceRejectedTestCases() {
  it('email to traceOwner, when proposed trace rejected', async () => {
    const emailService = app.service('emails');
    const { campaign, trace, traceOwner } = await createTraceAndCampaign();
    const message = `test message - ${new Date()}`;
    await proposedTraceRejected(app, {
      trace,
      message,
    });
    // because creating and sending email is async, we should wait to make sure the email hooks worked
    await sleep(50);
    const traceOwnerEmails = await emailService.find({
      paginate: false,
      query: {
        recipient: traceOwner.email,
        traceId: trace._id,
        campaignId: campaign._id,
        unsubscribeType: EmailSubscribeTypes.PROPOSED_MILESTONE_REJECTED,
      },
    });
    assert.isAtLeast(traceOwnerEmails.length, 1);
    assert.equal(traceOwnerEmails[0].message, message);
  });
}

function traceRequestReviewTestCases() {
  it('email to traceReviewer, when proposed trace requested for review', async () => {
    const emailService = app.service('emails');
    const { campaign, trace, traceReviewer } = await createTraceAndCampaign();
    const message = `test message - ${new Date()}`;
    await traceRequestReview(app, {
      trace,
      message,
    });
    // because creating and sending email is async, we should wait to make sure the email hooks worked
    await sleep(50);
    const traceReviewerEmails = await emailService.find({
      paginate: false,
      query: {
        recipient: traceReviewer.email,
        traceId: trace._id,
        campaignId: campaign._id,
        unsubscribeType: EmailSubscribeTypes.MILESTONE_REQUEST_REVIEW,
      },
    });
    assert.isAtLeast(traceReviewerEmails.length, 1);
    assert.equal(traceReviewerEmails[0].message, message);
  });
}

function traceReviewRejectedTestCases() {
  it('email to traceOwner, when proposed trace rejected', async () => {
    const emailService = app.service('emails');
    const { campaign, trace, traceOwner } = await createTraceAndCampaign();
    const message = `test message - ${new Date()}`;
    await traceReviewRejected(app, {
      trace,
      message,
    });
    // because creating and sending email is async, we should wait to make sure the email hooks worked
    await sleep(50);
    const traceOwnerEmails = await emailService.find({
      paginate: false,
      query: {
        recipient: traceOwner.email,
        traceId: trace._id,
        campaignId: campaign._id,
        unsubscribeType: EmailSubscribeTypes.MILESTONE_REVIEW_REJECTED,
      },
    });
    assert.isAtLeast(traceOwnerEmails.length, 1);
    assert.equal(traceOwnerEmails[0].message, message);
  });
}

function traceCancelledTestCases() {
  it('email to traceOwner, when proposed trace marks as complete', async () => {
    const emailService = app.service('emails');
    const { campaign, trace, traceOwner } = await createTraceAndCampaign();
    const message = `test message - ${new Date()}`;
    await traceCancelled(app, {
      trace,
      message,
    });
    // because creating and sending email is async, we should wait to make sure the email hooks worked
    await sleep(50);
    const traceOwnerEmails = await emailService.find({
      paginate: false,
      query: {
        recipient: traceOwner.email,
        traceId: trace._id,
        campaignId: campaign._id,
        unsubscribeType: EmailSubscribeTypes.MILESTONE_CANCELLED,
      },
    });
    assert.isAtLeast(traceOwnerEmails.length, 1);
    assert.equal(traceOwnerEmails[0].message, message);
  });
}

const traceMarkedCompletedTestCases = () => {
  const message = `test message - ${new Date()}`;

  it('email to traceRecipient, when proposed trace marks as complete', async () => {
    const emailService = app.service('emails');
    const { campaign, trace, traceRecipient } = await createTraceAndCampaign();
    await traceMarkedCompleted(app, {
      trace,
      message,
    });
    await sleep(50);

    const traceRecipientEmails = await emailService.find({
      paginate: false,
      query: {
        recipient: traceRecipient.email,
        traceId: trace._id,
        campaignId: campaign._id,
        message,
        unsubscribeType: EmailSubscribeTypes.MILESTONE_REVIEW_APPROVED,
      },
    });
    assert.isAtLeast(traceRecipientEmails.length, 1);
  });
  it('email to traceReviewer, when proposed trace marks as complete', async () => {
    const emailService = app.service('emails');
    const { campaign, trace, traceReviewer } = await createTraceAndCampaign();
    await traceMarkedCompleted(app, {
      trace,
      message,
    });
    await sleep(50);

    const traceReviewerEmails = await emailService.find({
      paginate: false,
      query: {
        recipient: traceReviewer.email,
        traceId: trace._id,
        campaignId: campaign._id,
        message,
        unsubscribeType: EmailSubscribeTypes.MILESTONE_REVIEW_APPROVED,
      },
    });
    assert.isAtLeast(traceReviewerEmails.length, 1);
  });
  it('email to campaignOwner, when proposed trace marks as complete', async () => {
    const emailService = app.service('emails');
    const { campaign, trace, campaignOwner } = await createTraceAndCampaign();
    await traceMarkedCompleted(app, {
      trace,
      message,
    });
    await sleep(50);

    const campaignOwnerEmails = await emailService.find({
      paginate: false,
      query: {
        recipient: campaignOwner.email,
        traceId: trace._id,
        campaignId: campaign._id,
        message,
        unsubscribeType: EmailSubscribeTypes.MILESTONE_REVIEW_APPROVED,
      },
    });
    assert.isAtLeast(campaignOwnerEmails.length, 1);
  });
  it('email to campaignReviewer, when proposed trace marks as complete', async () => {
    const emailService = app.service('emails');
    const { campaign, trace, campaignReviewer } = await createTraceAndCampaign();
    await traceMarkedCompleted(app, {
      trace,
      message,
    });
    await sleep(50);

    const campaignReviewerEmails = await emailService.find({
      paginate: false,
      query: {
        recipient: campaignReviewer.email,
        traceId: trace._id,
        campaignId: campaign._id,
        message,
        unsubscribeType: EmailSubscribeTypes.MILESTONE_REVIEW_APPROVED,
      },
    });
    assert.isAtLeast(campaignReviewerEmails.length, 1);
  });
  it('email to communityOwner, when proposed trace marks as complete', async () => {
    const emailService = app.service('emails');
    const { campaign, trace, communityOwner } = await createTraceAndCampaign();
    await traceMarkedCompleted(app, {
      trace,
      message,
    });
    await sleep(50);

    const communityOwnerEmails = await emailService.find({
      paginate: false,
      query: {
        recipient: communityOwner.email,
        traceId: trace._id,
        campaignId: campaign._id,
        unsubscribeType: EmailSubscribeTypes.MILESTONE_REVIEW_APPROVED,
      },
    });
    assert.isAtLeast(communityOwnerEmails.length, 1);
  });

  it('email to traceOwner, when proposed trace marks as complete', async () => {
    const emailService = app.service('emails');

    const { campaign, trace, traceOwner } = await createTraceAndCampaign();

    await traceMarkedCompleted(app, {
      trace,
      message,
    });
    // because creating and sending email is async, we should wait to make sure the email hooks worked
    await sleep(50);
    const traceOwnerEmails = await emailService.find({
      paginate: false,
      query: {
        recipient: traceOwner.email,
        traceId: trace._id,
        message,
        campaignId: campaign._id,
        unsubscribeType: EmailSubscribeTypes.MILESTONE_REVIEW_APPROVED,
      },
    });
    assert.isAtLeast(traceOwnerEmails.length, 1);
  });
};

function donationsCollectedTestCases() {
  it('email to traceRecipient, when collect trace donations', async () => {
    const emailService = app.service('emails');
    const { campaign, trace, traceRecipient } = await createTraceAndCampaign();
    await donationsCollected(app, {
      trace,
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
    const traceRecipientEmails = await emailService.find({
      paginate: false,
      query: {
        recipient: traceRecipient.email,
        traceId: trace._id,
        campaignId: campaign._id,
        unsubscribeType: EmailSubscribeTypes.DONATIONS_COLLECTED,
      },
    });
    assert.isAtLeast(traceRecipientEmails.length, 1);
  });
}
function traceReceivedDonationTestCases() {
  it('email to traceRecipient, when someone donate/delagate to trace', async () => {
    const emailService = app.service('emails');
    const { campaign, trace, traceRecipient } = await createTraceAndCampaign();
    await traceReceivedDonation(app, {
      trace,
      token: {
        symbol: 'ETH',
      },
      amount: '1000000000',
    });
    // because creating and sending email is async, we should wait to make sure the email hooks worked
    await sleep(50);
    const traceRecipientEmails = await emailService.find({
      paginate: false,
      query: {
        recipient: traceRecipient.email,
        traceId: trace._id,
        campaignId: campaign._id,
        unsubscribeType: EmailSubscribeTypes.DONATION_RECEIVED,
      },
    });
    assert.isAtLeast(traceRecipientEmails.length, 1);
  });
  it('email to traceOwner, when someone donate/delagate to trace', async () => {
    const emailService = app.service('emails');
    const { campaign, trace, traceOwner } = await createTraceAndCampaign();
    await traceReceivedDonation(app, {
      trace,
      token: {
        symbol: 'ETH',
      },
      amount: '1000000000',
    });
    // because creating and sending email is async, we should wait to make sure the email hooks worked
    await sleep(50);
    const traceOwnerEmails = await emailService.find({
      paginate: false,
      query: {
        recipient: traceOwner.email,
        traceId: trace._id,
        campaignId: campaign._id,
        unsubscribeType: EmailSubscribeTypes.DONATION_RECEIVED,
      },
    });
    assert.isAtLeast(traceOwnerEmails.length, 1);
  });
}

function moneyWentToRecipientWalletTestCases() {
  it('email to traceRecipient, when money goes to recipient wallet', async () => {
    const emailService = app.service('emails');
    const { campaign, trace, traceRecipient } = await createTraceAndCampaign();
    await moneyWentToRecipientWallet(app, {
      trace,
      payments: [
        {
          symbol: 'ETH',
          amount: '1000000000',
        },
      ],
    });
    // because creating and sending email is async, we should wait to make sure the email hooks worked
    await sleep(50);
    const traceRecipientEmails = await emailService.find({
      paginate: false,
      query: {
        recipient: traceRecipient.email,
        traceId: trace._id,
        campaignId: campaign._id,
        unsubscribeType: EmailSubscribeTypes.DONATIONS_COLLECTED,
      },
    });
    assert.isAtLeast(traceRecipientEmails.length, 1);
  });
  it('email to traceOwner, when someone donate/delagate to trace', async () => {
    const emailService = app.service('emails');
    const { campaign, trace, traceOwner } = await createTraceAndCampaign();
    await traceReceivedDonation(app, {
      trace,
      token: {
        symbol: 'ETH',
      },
      amount: '1000000000',
    });
    // because creating and sending email is async, we should wait to make sure the email hooks worked
    await sleep(50);
    const traceOwnerEmails = await emailService.find({
      paginate: false,
      query: {
        recipient: traceOwner.email,
        traceId: trace._id,
        campaignId: campaign._id,
        unsubscribeType: EmailSubscribeTypes.DONATION_RECEIVED,
      },
    });
    assert.isAtLeast(traceOwnerEmails.length, 1);
  });
}

describe('test normalizeAmount', normalizeAmountTestCases);
describe('test capitalizeDelegateType', capitalizeDelegateTypeTestCases);
describe('test generateTraceCtaRelativeUrl', generateTraceCtaRelativeUrlTestCases);
describe('test proposedTraceEdited', proposedTraceEditedTestCases);
describe('test traceProposed', traceProposedTestCases);
describe('test proposedTraceAccepted', proposedTraceAcceptedTestCases);
describe('test proposedTraceRejected', proposedTraceRejectedTestCases);
describe('test traceRequestReview', traceRequestReviewTestCases);
describe('test traceReviewRejected', traceReviewRejectedTestCases);
describe('test traceReviewRejected', traceReviewRejectedTestCases);
describe('test traceMarkedCompleted', traceMarkedCompletedTestCases);
describe('test traceCancelled', traceCancelledTestCases);
describe('test donationsCollected', donationsCollectedTestCases);
describe('test traceReceivedDonation', traceReceivedDonationTestCases);
describe('test moneyWentToRecipientWallet', moneyWentToRecipientWalletTestCases);
