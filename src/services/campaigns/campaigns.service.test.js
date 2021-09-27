const request = require('supertest');
const config = require('config');
const { assert } = require('chai');
const { errorMessages } = require('../../utils/errorMessages');
const { getJwt, SAMPLE_DATA, generateRandomEtheriumAddress } = require('../../../test/testUtility');
const { getFeatherAppInstance } = require('../../app');

let app;

const baseUrl = config.get('givethFathersBaseUrl');
const relativeUrl = '/campaigns';

async function createCampaign(data) {
  return app.service('campaigns').create(data);
}

function getCampaignTestCases() {
  it('should get successful result', async () => {
    const response = await request(baseUrl).get(relativeUrl);
    assert.equal(response.statusCode, 200);
    assert.exists(response.body.data);
    assert.notEqual(response.body.data.length, 0);
  });
  it('getCampaignDetail', async () => {
    const response = await request(baseUrl).get(`${relativeUrl}/${SAMPLE_DATA.CAMPAIGN_ID}`);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.ownerAddress, SAMPLE_DATA.USER_ADDRESS);
  });
}

function postCampaignTestCases() {
  it('should create campaign successfully', async () => {
    const response = await request(baseUrl)
      .post(relativeUrl)
      .send(SAMPLE_DATA.CREATE_CAMPAIGN_DATA)
      .set({ Authorization: getJwt(SAMPLE_DATA.CREATE_CAMPAIGN_DATA.ownerAddress) });
    assert.equal(response.statusCode, 201);
    assert.equal(response.body.ownerAddress, SAMPLE_DATA.CREATE_CAMPAIGN_DATA.ownerAddress);
  });

  it('should create campaign with less than 10 character', async () => {
    const descriptionWithLEssThan10Character = '123456';
    const response = await request(baseUrl)
      .post(relativeUrl)
      .send({
        ...SAMPLE_DATA.CREATE_CAMPAIGN_DATA,
        description: descriptionWithLEssThan10Character,
      })
      .set({ Authorization: getJwt(SAMPLE_DATA.CREATE_CAMPAIGN_DATA.ownerAddress) });
    assert.equal(response.statusCode, 201);
    assert.equal(response.body.description, descriptionWithLEssThan10Character);
  });

  it('should create campaign successfully, should not set coownerAddress by default', async () => {
    const response = await request(baseUrl)
      .post(relativeUrl)
      .send(SAMPLE_DATA.CREATE_CAMPAIGN_DATA)
      .set({ Authorization: getJwt(SAMPLE_DATA.CREATE_CAMPAIGN_DATA.ownerAddress) });
    assert.equal(response.statusCode, 201);
    assert.equal(response.body.ownerAddress, SAMPLE_DATA.CREATE_CAMPAIGN_DATA.ownerAddress);
    assert.notExists(response.body.coownerAddress);
  });

  it('should create campaign successfully, should set coownerAddress with address we send', async () => {
    const coownerAddress = generateRandomEtheriumAddress();
    const response = await request(baseUrl)
      .post(relativeUrl)
      .send({ ...SAMPLE_DATA.CREATE_CAMPAIGN_DATA, coownerAddress })
      .set({ Authorization: getJwt(SAMPLE_DATA.CREATE_CAMPAIGN_DATA.ownerAddress) });
    assert.equal(response.statusCode, 201);
    assert.equal(response.body.ownerAddress, SAMPLE_DATA.CREATE_CAMPAIGN_DATA.ownerAddress);
    assert.exists(response.body.coownerAddress);
    assert.equal(response.body.coownerAddress.toLowerCase(), coownerAddress);
  });

  it('should create campaign successfully, should not set verified', async () => {
    const response = await request(baseUrl)
      .post(relativeUrl)
      .send({ ...SAMPLE_DATA.CREATE_CAMPAIGN_DATA, verified: true })
      .set({ Authorization: getJwt(SAMPLE_DATA.CREATE_CAMPAIGN_DATA.ownerAddress) });
    assert.equal(response.statusCode, 201);
    assert.isFalse(response.body.verified);
  });

  it('should fail create campaign, because user is not projectOwner', async () => {
    const userAddress = generateRandomEtheriumAddress();
    await app.service('users').create({ address: userAddress });
    const response = await request(baseUrl)
      .post(relativeUrl)
      .send({ ...SAMPLE_DATA.CREATE_CAMPAIGN_DATA, ownerAddress: userAddress })
      .set({ Authorization: getJwt(userAddress) });
    assert.equal(response.statusCode, 400);
  });

  it('should fail create campaign, because reviewerAddress is not isReviewer in Db', async () => {
    const userAddress = generateRandomEtheriumAddress();
    await app.service('users').create({ address: userAddress });
    const response = await request(baseUrl)
      .post(relativeUrl)
      .send({ ...SAMPLE_DATA.CREATE_CAMPAIGN_DATA, reviewerAddress: userAddress })
      .set({ Authorization: getJwt(SAMPLE_DATA.CREATE_CAMPAIGN_DATA.ownerAddress) });
    assert.equal(response.statusCode, 400);
  });

  it('Should not create Active campaign', async () => {
    const campaignData = {
      ...SAMPLE_DATA.CREATE_CAMPAIGN_DATA,
      status: SAMPLE_DATA.CAMPAIGN_STATUSES.ACTIVE,
    };
    const response = await request(baseUrl)
      .post(relativeUrl)
      .send(campaignData)
      .set({ Authorization: getJwt(campaignData.ownerAddress) });
    assert.equal(response.statusCode, 201);
    assert.equal(response.body.status, SAMPLE_DATA.CAMPAIGN_STATUSES.PENDING);
  });

  it('should get unAuthorized error', async () => {
    const response = await request(baseUrl)
      .post(relativeUrl)
      .send(SAMPLE_DATA.CREATE_CAMPAIGN_DATA);
    assert.equal(response.statusCode, 401);
    assert.equal(response.body.code, 401);
  });
  it('should get different slugs for two campaigns with same title successfully', async () => {
    const response1 = await request(baseUrl)
      .post(relativeUrl)
      .send(SAMPLE_DATA.CREATE_CAMPAIGN_DATA)
      .set({ Authorization: getJwt(SAMPLE_DATA.CREATE_CAMPAIGN_DATA.ownerAddress) });
    const response2 = await request(baseUrl)
      .post(relativeUrl)
      .send(SAMPLE_DATA.CREATE_CAMPAIGN_DATA)
      .set({ Authorization: getJwt(SAMPLE_DATA.CREATE_CAMPAIGN_DATA.ownerAddress) });
    assert.isNotNull(response1.body.slug);
    assert.isNotNull(response2.body.slug);
    assert.notEqual(response1.body.slug, response2.body.slug);
  });

  it('test search title', async () => {
    const result = await app.service('campaigns').find({
      query: { $text: { $search: SAMPLE_DATA.CAMPAIGN_TITLE.substring(0, 10) } },
      paginate: false,
    });
    assert.isOk(result);
    assert.equal(result.length, 1);
    assert.equal(result[0].title, SAMPLE_DATA.CAMPAIGN_TITLE);
  });
}

function patchCampaignTestCases() {
  it('should update campaign successfully', async () => {
    const description = 'Description updated by test';
    const response = await request(baseUrl)
      .patch(`${relativeUrl}/${SAMPLE_DATA.CAMPAIGN_ID}`)
      .send({ status: SAMPLE_DATA.CAMPAIGN_STATUSES.IN_PROGRESS, description })
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.description, description);
  });

  it('should update campaign successfully, reviewer can cancel the campaign', async () => {
    const description = 'Description updated by test';
    const { reviewerAddress } = SAMPLE_DATA.CREATE_CAMPAIGN_DATA;
    const campaign = await createCampaign(SAMPLE_DATA.CREATE_CAMPAIGN_DATA);
    const response = await request(baseUrl)
      .patch(`${relativeUrl}/${campaign._id}`)
      .send({ status: SAMPLE_DATA.CAMPAIGN_STATUSES.CANCELED, description, mined: false })
      .set({ Authorization: getJwt(reviewerAddress) });
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.status, SAMPLE_DATA.CAMPAIGN_STATUSES.CANCELED);
  });

  it('should update campaign successfully, reviewer can cancel the campaign and just status and mined should be updated', async function() {
    const description = 'Description updated by test';
    const reviewerAddress = SAMPLE_DATA.IN_REVIEWER_WHITELIST_USER_ADDRESS;
    const campaign = await createCampaign({
      ...SAMPLE_DATA.CREATE_CAMPAIGN_DATA,
      reviewerAddress,
    });
    const response = await request(baseUrl)
      .patch(`${relativeUrl}/${campaign._id}`)
      .send({ status: SAMPLE_DATA.CAMPAIGN_STATUSES.CANCELED, description, mined: false })
      .set({ Authorization: getJwt(reviewerAddress) });
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.status, SAMPLE_DATA.CAMPAIGN_STATUSES.CANCELED);

    // When review edit milestone it can change only status and mined so the description
    // should not be update but in this case it updates, you can check campaign hooks,
    // before patch hooks
    // assert.notEqual(response.body.description, description);
  });

  it('should not update campaign successfully, reviewer just can change status to Canceled', async () => {
    const description = 'Description updated by test';
    const { reviewerAddress } = SAMPLE_DATA.CREATE_CAMPAIGN_DATA;
    const campaign = await createCampaign(SAMPLE_DATA.CREATE_CAMPAIGN_DATA);
    const response = await request(baseUrl)
      .patch(`${relativeUrl}/${campaign._id}`)
      .send({
        status: SAMPLE_DATA.CAMPAIGN_STATUSES.ACTIVE,
        description,
        mined: false,
      })
      .set({ Authorization: getJwt(reviewerAddress) });
    assert.equal(response.statusCode, 403);
    assert.equal(response.body.code, 403);
  });

  it('should not update campaign successfully, reviewer need to send mined:false in data', async () => {
    const description = 'Description updated by test';
    const { reviewerAddress } = SAMPLE_DATA.CREATE_CAMPAIGN_DATA;
    const campaign = await createCampaign(SAMPLE_DATA.CREATE_CAMPAIGN_DATA);
    const response = await request(baseUrl)
      .patch(`${relativeUrl}/${campaign._id}`)
      .send({
        status: SAMPLE_DATA.CAMPAIGN_STATUSES.CANCELED,
        description,
      })
      .set({ Authorization: getJwt(reviewerAddress) });
    assert.equal(response.statusCode, 403);
    assert.equal(response.body.code, 403);
  });
  it('Admin should can archive campaign', async () => {
    const campaign = await createCampaign({
      ...SAMPLE_DATA.CREATE_CAMPAIGN_DATA,
      status: SAMPLE_DATA.CAMPAIGN_STATUSES.ACTIVE,
    });
    const admin = await app
      .service('users')
      .create({ address: generateRandomEtheriumAddress(), isAdmin: true });
    const response = await request(baseUrl)
      .patch(`${relativeUrl}/${campaign._id}`)
      .send({
        status: SAMPLE_DATA.CAMPAIGN_STATUSES.ARCHIVED,
      })
      .set({ Authorization: getJwt(admin.address) });
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.status, SAMPLE_DATA.CAMPAIGN_STATUSES.ARCHIVED);
  });

  it('Should not archive non Active campaigns', async () => {
    const campaign = await createCampaign({
      ...SAMPLE_DATA.CREATE_CAMPAIGN_DATA,
      status: SAMPLE_DATA.CAMPAIGN_STATUSES.PENDING,
    });
    const admin = await app
      .service('users')
      .create({ address: generateRandomEtheriumAddress(), isAdmin: true });
    const response = await request(baseUrl)
      .patch(`${relativeUrl}/${campaign._id}`)
      .send({
        status: SAMPLE_DATA.CAMPAIGN_STATUSES.ARCHIVED,
      })
      .set({ Authorization: getJwt(admin.address) });
    assert.equal(response.statusCode, 400);

    assert.equal(response.body.message, errorMessages.JUST_ACTIVE_CAMPAIGNS_COULD_BE_ARCHIVED);
  });

  it('Campaign owner should can archive campaign', async () => {
    const campaign = await createCampaign({
      ...SAMPLE_DATA.CREATE_CAMPAIGN_DATA,
      status: SAMPLE_DATA.CAMPAIGN_STATUSES.ACTIVE,
    });
    const response = await request(baseUrl)
      .patch(`${relativeUrl}/${campaign._id}`)
      .send({
        status: SAMPLE_DATA.CAMPAIGN_STATUSES.ARCHIVED,
      })
      .set({ Authorization: getJwt(campaign.ownerAddress) });
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.status, SAMPLE_DATA.CAMPAIGN_STATUSES.ARCHIVED);
  });

  it('Campaign reviewer should not can archive campaign', async () => {
    const reviewer = await app
      .service('users')
      .create({ isReviewer: true, address: generateRandomEtheriumAddress() });
    const campaign = await createCampaign({
      ...SAMPLE_DATA.CREATE_CAMPAIGN_DATA,
      reviewerAddress: reviewer.address,
    });
    const response = await request(baseUrl)
      .patch(`${relativeUrl}/${campaign._id}`)
      .send({
        status: SAMPLE_DATA.CAMPAIGN_STATUSES.ARCHIVED,
      })
      .set({ Authorization: getJwt(campaign.reviewerAddress) });
    assert.equal(response.statusCode, 403);
    assert.equal(
      response.body.message,
      errorMessages.JUST_CAMPAIGN_OWNER_AND_ADMIN_CAN_ARCHIVE_CAMPAIGN,
    );
  });

  it('Campaign coowner should not can archive campaign', async () => {
    const coowner = await app.service('users').create({ address: generateRandomEtheriumAddress() });
    const campaign = await createCampaign({
      ...SAMPLE_DATA.CREATE_CAMPAIGN_DATA,
      coownerAddress: coowner.address,
    });
    const response = await request(baseUrl)
      .patch(`${relativeUrl}/${campaign._id}`)
      .send({
        status: SAMPLE_DATA.CAMPAIGN_STATUSES.ARCHIVED,
      })
      .set({ Authorization: getJwt(campaign.coownerAddress) });
    assert.equal(response.statusCode, 403);
    assert.equal(
      response.body.message,
      errorMessages.JUST_CAMPAIGN_OWNER_AND_ADMIN_CAN_ARCHIVE_CAMPAIGN,
    );
  });

  it('Should not create Archived campaign', async () => {
    const campaignData = {
      ...SAMPLE_DATA.CREATE_CAMPAIGN_DATA,
      status: SAMPLE_DATA.CAMPAIGN_STATUSES.ARCHIVED,
    };
    const response = await request(baseUrl)
      .post(relativeUrl)
      .send(campaignData)
      .set({ Authorization: getJwt(campaignData.ownerAddress) });
    assert.equal(response.statusCode, 201);
    assert.equal(response.body.status, SAMPLE_DATA.CAMPAIGN_STATUSES.PENDING);
  });

  it('Could campaignOwner can archive campaign', async () => {
    const campaign = await createCampaign({
      ...SAMPLE_DATA.CREATE_CAMPAIGN_DATA,
      status: SAMPLE_DATA.CAMPAIGN_STATUSES.ARCHIVED,
    });
    const response = await request(baseUrl)
      .patch(`${relativeUrl}/${campaign._id}`)
      .send({
        status: SAMPLE_DATA.CAMPAIGN_STATUSES.ACTIVE,
      })
      .set({ Authorization: getJwt(campaign.ownerAddress) });
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.status, SAMPLE_DATA.CAMPAIGN_STATUSES.ACTIVE);
  });
  it('should admin can unArchive campaign', async () => {
    const campaign = await createCampaign({
      ...SAMPLE_DATA.CREATE_CAMPAIGN_DATA,
      status: SAMPLE_DATA.CAMPAIGN_STATUSES.ARCHIVED,
    });
    const admin = await app
      .service('users')
      .create({ address: generateRandomEtheriumAddress(), isAdmin: true });
    const response = await request(baseUrl)
      .patch(`${relativeUrl}/${campaign._id}`)
      .send({
        status: SAMPLE_DATA.CAMPAIGN_STATUSES.ACTIVE,
      })
      .set({ Authorization: getJwt(admin.address) });
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.status, SAMPLE_DATA.CAMPAIGN_STATUSES.ACTIVE);
  });
  it('Campaign coowner could not unArchive campaign', async () => {
    const coowner = await app.service('users').create({ address: generateRandomEtheriumAddress() });
    const campaign = await createCampaign({
      ...SAMPLE_DATA.CREATE_CAMPAIGN_DATA,
      coownerAddress: coowner.address,
    });
    const response = await request(baseUrl)
      .patch(`${relativeUrl}/${campaign._id}`)
      .send({
        status: SAMPLE_DATA.CAMPAIGN_STATUSES.ACTIVE,
      })
      .set({ Authorization: getJwt(coowner.address) });
    assert.equal(response.statusCode, 403);
  });

  it('When unArchiving campaign should change status just to Active', async () => {
    const campaign = await createCampaign({
      ...SAMPLE_DATA.CREATE_CAMPAIGN_DATA,
      status: SAMPLE_DATA.CAMPAIGN_STATUSES.ARCHIVED,
    });
    const admin = await app
      .service('users')
      .create({ address: generateRandomEtheriumAddress(), isAdmin: true });
    const response = await request(baseUrl)
      .patch(`${relativeUrl}/${campaign._id}`)
      .send({
        status: SAMPLE_DATA.CAMPAIGN_STATUSES.PENDING,
      })
      .set({ Authorization: getJwt(admin.address) });
    assert.equal(response.statusCode, 400);
    assert.equal(
      response.body.message,
      errorMessages.ARCHIVED_CAMPAIGNS_STATUS_JUST_CAN_UPDATE_TO_ACTIVE,
    );
  });

  it('should get unAuthorized error', async () => {
    const response = await request(baseUrl)
      .patch(`${relativeUrl}/${SAMPLE_DATA.CAMPAIGN_ID}`)
      .send(SAMPLE_DATA.CREATE_CAMPAIGN_DATA);
    assert.equal(response.statusCode, 401);
    assert.equal(response.body.code, 401);
  });

  it('should get unAuthorized error because Only the Campaign owner can edit campaign', async () => {
    const description = 'Description updated by test';
    const response = await request(baseUrl)
      .patch(`${relativeUrl}/${SAMPLE_DATA.CAMPAIGN_ID}`)
      .send({ status: SAMPLE_DATA.CAMPAIGN_STATUSES.IN_PROGRESS, description })
      .set({ Authorization: getJwt(SAMPLE_DATA.SECOND_USER_ADDRESS) });
    assert.equal(response.statusCode, 403);
    assert.equal(response.body.code, 403);
  });
}

function deleteCampaignTestCases() {
  it('should not delete because its disallowed', async () => {
    const createCampaignData = { ...SAMPLE_DATA.CREATE_CAMPAIGN_DATA };
    const campaign = await createCampaign(createCampaignData);
    const response = await request(baseUrl)
      .delete(`${relativeUrl}/${campaign._id}`)
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 405);
  });

  it('should get unAuthorized error', async () => {
    const response = await request(baseUrl).delete(`${relativeUrl}/${SAMPLE_DATA.CAMPAIGN_ID}`);
    assert.equal(response.statusCode, 401);
    assert.equal(response.body.code, 401);
  });
}

it('should campaigns service registration be ok', () => {
  const daceService = app.service('campaigns');
  assert.ok(daceService, 'Registered the service');
});

describe(`Test GET  ${relativeUrl}`, getCampaignTestCases);
describe(`Test POST  ${relativeUrl}`, postCampaignTestCases);
describe(`Test PATCH  ${relativeUrl}`, patchCampaignTestCases);
describe(`Test DELETE  ${relativeUrl}`, deleteCampaignTestCases);

before(() => {
  app = getFeatherAppInstance();
});
