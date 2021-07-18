const request = require('supertest');
const config = require('config');
const { assert } = require('chai');
const {
  findProjectSubscribers,
  findParentCommunitySubscribersForCampaign,
} = require('./subscriptionRepository');

const { getJwt, SAMPLE_DATA, generateRandomEtheriumAddress } = require('../../test/testUtility');
const { getFeatherAppInstance } = require('../app');

const baseUrl = config.get('givethFathersBaseUrl');
let app;

before(() => {
  app = getFeatherAppInstance();
});

function findProjectSubscribersTests() {
  it('should return subscriber users that have email', async () => {
    const userService = app.service('users');
    const user = await userService.create({
      address: generateRandomEtheriumAddress(),
      email: `${new Date().getTime()}-communitySubscriber@test.giveth`,
      isAdmin: true,
      name: `community subscriber ${new Date()}`,
    });
    const community = (
      await request(baseUrl)
        .post('/communities')
        .send({
          ...SAMPLE_DATA.CREATE_COMMUNITY_DATA,
          ownerAddress: SAMPLE_DATA.USER_ADDRESS,
        })
        .set({ Authorization: getJwt(SAMPLE_DATA.USER_ADDRESS) })
    ).body;
    const subscription = await app
      .service('subscriptions')
      .Model({
        userAddress: user.address,
        projectType: 'community',
        projectTypeId: community._id,
        enabled: true,
      })
      .save();
    const subscriptions = await findProjectSubscribers(app, {
      projectTypeId: community._id,
    });
    assert.isArray(subscriptions);
    assert.equal(subscriptions[0].user.address, user.address);
    assert.equal(String(subscriptions[0]._id), String(subscription._id));
  });
  it('should doesnt return subscriptions for disabled subscriptions', async () => {
    const userService = app.service('users');
    const user = await userService.create({
      address: generateRandomEtheriumAddress(),
      email: `${new Date().getTime()}-communitySubscriber@test.giveth`,
      isAdmin: true,
      name: `community subscriber ${new Date()}`,
    });
    const community = (
      await request(baseUrl)
        .post('/communities')
        .send({
          ...SAMPLE_DATA.CREATE_COMMUNITY_DATA,
          ownerAddress: SAMPLE_DATA.USER_ADDRESS,
        })
        .set({ Authorization: getJwt(SAMPLE_DATA.USER_ADDRESS) })
    ).body;
    await app
      .service('subscriptions')
      .Model({
        userAddress: user.address,
        projectType: 'community',
        projectTypeId: community._id,
        enabled: false,
      })
      .save();
    const subscriptions = await findProjectSubscribers(app, {
      projectTypeId: community._id,
    });
    assert.isArray(subscriptions);
    assert.isEmpty(subscriptions);
  });
  it('should not return subscriber when users doesnt have email', async () => {
    const userService = app.service('users');
    const user = await userService.create({
      address: generateRandomEtheriumAddress(),
      isAdmin: true,
      name: `community subscriber ${new Date()}`,
    });
    const community = (
      await request(baseUrl)
        .post('/communities')
        .send({
          ...SAMPLE_DATA.CREATE_COMMUNITY_DATA,
          ownerAddress: SAMPLE_DATA.USER_ADDRESS,
        })
        .set({ Authorization: getJwt(SAMPLE_DATA.USER_ADDRESS) })
    ).body;
    await app
      .service('subscriptions')
      .Model({
        userAddress: user.address,
        projectType: 'community',
        projectTypeId: community._id,
        enabled: true,
      })
      .save();
    const subscriptions = await findProjectSubscribers(app, {
      projectTypeId: community._id,
    });
    assert.isArray(subscriptions);
    assert.isEmpty(subscriptions);
  });
}
function findParentCommunitySubscribersForCampaignTests() {
  it('should return subscriptions for enabled subscriptions', async () => {
    const userService = app.service('users');
    const user = await userService.create({
      address: generateRandomEtheriumAddress(),
      email: `${new Date().getTime()}-communitySubscriber@test.giveth`,
      isAdmin: true,
      name: `community subscriber ${new Date()}`,
    });
    const campaign = (
      await request(baseUrl)
        .post('/campaigns')
        .send({
          ...SAMPLE_DATA.CREATE_CAMPAIGN_DATA,
          ownerAddress: user.address,
          reviewerAddress: user.address,
        })
        .set({ Authorization: getJwt(user.address) })
    ).body;

    const community = (
      await request(baseUrl)
        .post('/communities')
        .send({
          ...SAMPLE_DATA.CREATE_COMMUNITY_DATA,
          ownerAddress: SAMPLE_DATA.USER_ADDRESS,
          campaigns: [campaign._id],
        })
        .set({ Authorization: getJwt(SAMPLE_DATA.USER_ADDRESS) })
    ).body;
    await app
      .service('subscriptions')
      .Model({
        userAddress: user.address,
        projectType: 'community',
        projectTypeId: community._id,
        enabled: true,
      })
      .save();
    const communityWithSubscriptions = await findParentCommunitySubscribersForCampaign(app, {
      campaignId: String(campaign._id),
    });
    assert.isArray(communityWithSubscriptions);
    assert.equal(communityWithSubscriptions.length, 1);
    assert.equal(communityWithSubscriptions[0].title, community.title);
    assert.isArray(communityWithSubscriptions[0].subscriptions);
    assert.equal(communityWithSubscriptions[0].subscriptions.length, 1);
    assert.ok(communityWithSubscriptions[0].subscriptions[0].user);
    assert.equal(communityWithSubscriptions[0].subscriptions[0].user.email, user.email);
  });
  it('should not return subscriptions for disabled subscriptions', async () => {
    const userService = app.service('users');
    const user = await userService.create({
      address: generateRandomEtheriumAddress(),
      email: `${new Date().getTime()}-communitySubscriber@test.giveth`,
      isAdmin: true,
      name: `community subscriber ${new Date()}`,
    });
    const campaign = (
      await request(baseUrl)
        .post('/campaigns')
        .send({
          ...SAMPLE_DATA.CREATE_CAMPAIGN_DATA,
          ownerAddress: user.address,
          reviewerAddress: user.address,
        })
        .set({ Authorization: getJwt(user.address) })
    ).body;

    const community = (
      await request(baseUrl)
        .post('/communities')
        .send({
          ...SAMPLE_DATA.CREATE_COMMUNITY_DATA,
          ownerAddress: SAMPLE_DATA.USER_ADDRESS,
          campaigns: [campaign._id],
        })
        .set({ Authorization: getJwt(SAMPLE_DATA.USER_ADDRESS) })
    ).body;
    await app
      .service('subscriptions')
      .Model({
        userAddress: user.address,
        projectType: 'community',
        projectTypeId: community._id,
        enabled: false,
      })
      .save();
    const communityWithSubscriptions = await findParentCommunitySubscribersForCampaign(app, {
      campaignId: String(campaign._id),
    });
    assert.isArray(communityWithSubscriptions);
    assert.equal(communityWithSubscriptions.length, 1);
    assert.equal(communityWithSubscriptions[0].title, community.title);
    assert.isArray(communityWithSubscriptions[0].subscriptions);
    assert.equal(communityWithSubscriptions[0].subscriptions.length, 0);
  });
  it('should not return subscriptions for users without email', async () => {
    const userService = app.service('users');
    const user = await userService.create({
      address: generateRandomEtheriumAddress(),
      isAdmin: true,
      name: `community subscriber ${new Date()}`,
    });
    const campaign = (
      await request(baseUrl)
        .post('/campaigns')
        .send({
          ...SAMPLE_DATA.CREATE_CAMPAIGN_DATA,
          ownerAddress: user.address,
          reviewerAddress: user.address,
        })
        .set({ Authorization: getJwt(user.address) })
    ).body;

    const community = (
      await request(baseUrl)
        .post('/communities')
        .send({
          ...SAMPLE_DATA.CREATE_COMMUNITY_DATA,
          ownerAddress: SAMPLE_DATA.USER_ADDRESS,
          campaigns: [campaign._id],
        })
        .set({ Authorization: getJwt(SAMPLE_DATA.USER_ADDRESS) })
    ).body;
    await app
      .service('subscriptions')
      .Model({
        userAddress: user.address,
        projectType: 'community',
        projectTypeId: community._id,
        enabled: false,
      })
      .save();
    const communityWithSubscriptions = await findParentCommunitySubscribersForCampaign(app, {
      campaignId: String(campaign._id),
    });
    assert.isArray(communityWithSubscriptions);
    assert.equal(communityWithSubscriptions.length, 1);
    assert.equal(communityWithSubscriptions[0].title, community.title);
    assert.isArray(communityWithSubscriptions[0].subscriptions);
    assert.equal(communityWithSubscriptions[0].subscriptions.length, 0);
  });
}

describe(`findProjectSubscribers test cases`, findProjectSubscribersTests);
describe(
  `findParentCommunitySubscribersForCampaign test cases`,
  findParentCommunitySubscribersForCampaignTests,
);
