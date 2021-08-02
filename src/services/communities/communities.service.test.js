const request = require('supertest');
const config = require('config');
const { assert } = require('chai');
const {
  getJwt,
  SAMPLE_DATA,
  generateRandomTransactionHash,
  generateRandomEtheriumAddress,
} = require('../../../test/testUtility');
const { getFeatherAppInstance } = require('../../app');

let app;

const baseUrl = config.get('givethFathersBaseUrl');
const relativeUrl = '/communities';

async function createCommunity(data) {
  const response = await request(baseUrl)
    .post(relativeUrl)
    .send(data)
    .set({ Authorization: getJwt() });
  return response.body;
}

function getCommunityTestCases() {
  it('should get successful result', async () => {
    const response = await request(baseUrl).get(relativeUrl);
    assert.equal(response.statusCode, 200);
    assert.exists(response.body.data);
    assert.notEqual(response.body.data.length, 0);
  });
  it('getCommunityDetail', async () => {
    const response = await request(baseUrl).get(`${relativeUrl}/${SAMPLE_DATA.COMMUNITY_ID}`);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.ownerAddress, SAMPLE_DATA.USER_ADDRESS);
  });
}

function postCommunityTestCases() {
  it('should create community successfully', async () => {
    const response = await request(baseUrl)
      .post(relativeUrl)
      .send(SAMPLE_DATA.CREATE_COMMUNITY_DATA)
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 201);
    assert.equal(response.body.ownerAddress, SAMPLE_DATA.USER_ADDRESS);
  });

  it('should create community successfully, but verified should not set', async () => {
    const response = await request(baseUrl)
      .post(relativeUrl)
      .send({ ...SAMPLE_DATA.CREATE_COMMUNITY_DATA, verified: true })
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 201);
    assert.isFalse(response.body.verified);
  });

  it('should get unAuthorized error', async () => {
    const response = await request(baseUrl)
      .post(relativeUrl)
      .send(SAMPLE_DATA.CREATE_COMMUNITY_DATA);
    assert.equal(response.statusCode, 401);
    assert.equal(response.body.code, 401);
  });
  it('should get different slugs for two communitys with same title successfully', async () => {
    const response1 = await request(baseUrl)
      .post(relativeUrl)
      .send(SAMPLE_DATA.CREATE_COMMUNITY_DATA)
      .set({ Authorization: getJwt() });
    const response2 = await request(baseUrl)
      .post(relativeUrl)
      .send(SAMPLE_DATA.CREATE_COMMUNITY_DATA)
      .set({ Authorization: getJwt() });
    assert.isNotNull(response1.body.slug);
    assert.isNotNull(response2.body.slug);
    assert.notEqual(response1.body.slug, response2.body.slug);
  });

  it('should fail create community, because reviewerAddress is not isReviewer in Db', async () => {
    const userAddress = generateRandomEtheriumAddress();
    await app.service('users').create({ address: userAddress });
    const createTraceData = { ...SAMPLE_DATA.createTraceData(), reviewerAddress: userAddress };

    const response = await request(baseUrl)
      .post(relativeUrl)
      .send(createTraceData)
      .set({ Authorization: getJwt(createTraceData.ownerAddress) });
    assert.equal(response.statusCode, 400);
  });
  it('should fail create community, because ownerAddress is not isDelegator in Db', async () => {
    const userAddress = generateRandomEtheriumAddress();
    await app.service('users').create({ address: userAddress });
    const createTraceData = { ...SAMPLE_DATA.createTraceData(), ownerAddress: userAddress };

    const response = await request(baseUrl)
      .post(relativeUrl)
      .send(createTraceData)
      .set({ Authorization: getJwt(createTraceData.ownerAddress) });
    assert.equal(response.statusCode, 400);
  });
}

function patchCommunityTestCases() {
  it('should update community successfully', async () => {
    const description = 'Description updated by test';
    const response = await request(baseUrl)
      .patch(`${relativeUrl}/${SAMPLE_DATA.COMMUNITY_ID}`)
      .send({ status: SAMPLE_DATA.CAMPAIGN_STATUSES.IN_PROGRESS, description })
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.description, description);
  });

  it('should update community successfully, owner can update the community', async () => {
    const community = await createCommunity({
      ...SAMPLE_DATA.CREATE_COMMUNITY_DATA,
      status: SAMPLE_DATA.CommunityStatus.PENDING,
    });
    const response = await request(baseUrl)
      .patch(`${relativeUrl}/${community._id}`)
      .send({ status: SAMPLE_DATA.CAMPAIGN_STATUSES.CANCELED })
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.status, SAMPLE_DATA.CAMPAIGN_STATUSES.CANCELED);
  });

  it('should update community successfully,but txHash cant be updated', async () => {
    const community = await createCommunity({
      ...SAMPLE_DATA.CREATE_COMMUNITY_DATA,
    });
    const txHash = generateRandomTransactionHash();
    const response = await request(baseUrl)
      .patch(`${relativeUrl}/${community._id}`)
      .send({ txHash })
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 200);
    assert.notEqual(response.txHash, txHash);
  });

  it('should get unAuthorized error', async () => {
    const response = await request(baseUrl)
      .patch(`${relativeUrl}/${SAMPLE_DATA.COMMUNITY_ID}`)
      .send(SAMPLE_DATA.CREATE_COMMUNITY_DATA);
    assert.equal(response.statusCode, 401);
    assert.equal(response.body.code, 401);
  });

  it('should get unAuthorized error because Only the Community owner can edit community', async () => {
    const description = 'Description updated by test';
    const response = await request(baseUrl)
      .patch(`${relativeUrl}/${SAMPLE_DATA.COMMUNITY_ID}`)
      .send({ status: SAMPLE_DATA.CAMPAIGN_STATUSES.IN_PROGRESS, description })
      .set({ Authorization: getJwt(SAMPLE_DATA.SECOND_USER_ADDRESS) });
    assert.equal(response.statusCode, 403);
    assert.equal(response.body.code, 403);
  });
}

function deleteCommunityTestCases() {
  it('should not delete because its disallowed', async () => {
    const createCommunityData = { ...SAMPLE_DATA.CREATE_COMMUNITY_DATA };
    const community = await createCommunity(createCommunityData);
    const response = await request(baseUrl)
      .delete(`${relativeUrl}/${community._id}`)
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 405);
  });

  it('should get unAuthorized error', async () => {
    const response = await request(baseUrl).delete(`${relativeUrl}/${SAMPLE_DATA.COMMUNITY_ID}`);
    assert.equal(response.statusCode, 401);
    assert.equal(response.body.code, 401);
  });
}

it('should communities service registration be ok', () => {
  const communityService = app.service('communities');
  assert.ok(communityService, 'Registered the service');
});

describe(`Test GET  ${relativeUrl}`, getCommunityTestCases);
describe(`Test POST  ${relativeUrl}`, postCommunityTestCases);
describe(`Test PATCH  ${relativeUrl}`, patchCommunityTestCases);
describe(`Test DELETE  ${relativeUrl}`, deleteCommunityTestCases);

before(() => {
  app = getFeatherAppInstance();
});
