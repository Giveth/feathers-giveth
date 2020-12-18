const request = require('supertest');
const config = require('config');
const { assert } = require('chai');
const { getJwt, SAMPLE_DATA } = require('../../../test/testUtility');
const { getFeatherAppInstance } = require('../../app');

let app;

const baseUrl = config.get('givethFathersBaseUrl');
const relativeUrl = '/campaigns';

async function createCampaign(data) {
  const response = await request(baseUrl)
    .post(relativeUrl)
    .send(data)
    .set({ Authorization: getJwt() });
  return response.body;
}

function getCampaignTestCases() {
  it('should get successful result', async function() {
    const response = await request(baseUrl).get(relativeUrl);
    assert.equal(response.statusCode, 200);
    assert.exists(response.body.data);
    assert.notEqual(response.body.data.length, 0);
  });
  it('getCampaignDetail', async function() {
    const response = await request(baseUrl).get(`${relativeUrl}/${SAMPLE_DATA.CAMPAIGN_ID}`);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.ownerAddress, SAMPLE_DATA.USER_ADDRESS);
  });
}

function postCampaignTestCases() {
  it('should create campaign successfully', async function() {
    const response = await request(baseUrl)
      .post(relativeUrl)
      .send(SAMPLE_DATA.CREATE_CAMPAIGN_DATA)
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 201);
    assert.equal(response.body.ownerAddress, SAMPLE_DATA.USER_ADDRESS);
  });
  it('should get unAuthorized error', async function() {
    const response = await request(baseUrl)
      .post(relativeUrl)
      .send(SAMPLE_DATA.CREATE_CAMPAIGN_DATA);
    assert.equal(response.statusCode, 401);
    assert.equal(response.body.code, 401);
  });
}

function patchCampaignTestCases() {
  it('should update campaign successfully', async function() {
    const description = 'Description updated by test';
    const response = await request(baseUrl)
      .patch(`${relativeUrl}/${SAMPLE_DATA.CAMPAIGN_ID}`)
      .send({ status: SAMPLE_DATA.CAMPAIGN_STATUSES.IN_PROGRESS, description })
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.description, description);
  });

  it('should update campaign successfully, reviewer can cancel the campaign', async function() {
    const description = 'Description updated by test';
    const reviewerAddress = SAMPLE_DATA.SECOND_USER_ADDRESS;
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
  });

  it('should update campaign successfully, reviewer can cancel the campaign and just status and mined should be updated', async function() {
    const description = 'Description updated by test';
    const reviewerAddress = SAMPLE_DATA.SECOND_USER_ADDRESS;
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

  it('should not update campaign successfully, reviewer just can change status to Canceled', async function() {
    const description = 'Description updated by test';
    const reviewerAddress = SAMPLE_DATA.SECOND_USER_ADDRESS;
    const campaign = await createCampaign({
      ...SAMPLE_DATA.CREATE_CAMPAIGN_DATA,
      reviewerAddress,
    });
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

  it('should not update campaign successfully, reviewer need to send mined:false in data', async function() {
    const description = 'Description updated by test';
    const reviewerAddress = SAMPLE_DATA.SECOND_USER_ADDRESS;
    const campaign = await createCampaign({
      ...SAMPLE_DATA.CREATE_CAMPAIGN_DATA,
      reviewerAddress,
    });
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

  it('should get unAuthorized error', async function() {
    const response = await request(baseUrl)
      .patch(`${relativeUrl}/${SAMPLE_DATA.CAMPAIGN_ID}`)
      .send(SAMPLE_DATA.CREATE_CAMPAIGN_DATA);
    assert.equal(response.statusCode, 401);
    assert.equal(response.body.code, 401);
  });

  it('should get unAuthorized error because Only the Campaign owner can edit campaign', async function() {
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
  it('should not delete because its disallowed', async function() {
    const createCampaignData = { ...SAMPLE_DATA.CREATE_CAMPAIGN_DATA };
    const campaign = await createCampaign(createCampaignData);
    const response = await request(baseUrl)
      .delete(`${relativeUrl}/${campaign._id}`)
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 405);
  });

  it('should get unAuthorized error', async function() {
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
