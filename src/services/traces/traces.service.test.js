const request = require('supertest');
const config = require('config');
const { assert, expect } = require('chai');
const { getJwt, SAMPLE_DATA, generateRandomMongoId } = require('../../../test/testUtility');
const { getFeatherAppInstance } = require('../../app');

let app;
const baseUrl = config.get('givethFathersBaseUrl');
const relativeUrl = '/traces';

async function createTrace(data) {
  const response = await request(baseUrl)
    .post(relativeUrl)
    .send(data)
    .set({ Authorization: getJwt() });
  return response.body;
}

function getMilestoneTestCases() {
  it('should get successful result', async () => {
    const response = await request(baseUrl).get(relativeUrl);
    assert.equal(response.statusCode, 200);
    assert.exists(response.body.data);
    assert.notEqual(response.body.data.length, 0);
  });
  it('getMileStoneDetail', async () => {
    const response = await request(baseUrl).get(`${relativeUrl}/${SAMPLE_DATA.TRACE_ID}`);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.ownerAddress, SAMPLE_DATA.USER_ADDRESS);
  });
}

function postMilestoneTestCases() {
  it('should create trace successfully', async () => {
    const response = await request(baseUrl)
      .post(relativeUrl)
      .send(SAMPLE_DATA.createTraceData())
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 201);
    assert.equal(response.body.ownerAddress, SAMPLE_DATA.USER_ADDRESS);
  });
  it('should create trace successfully including category', async () => {
    const formType = 'expense';
    const response = await request(baseUrl)
      .post(relativeUrl)
      .send({ ...SAMPLE_DATA.createTraceData(), formType })
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 201);
    assert.equal(response.body.ownerAddress, SAMPLE_DATA.USER_ADDRESS);
    assert.equal(response.body.formType, formType);
  });

  it('should create trace , token must be returned', async () => {
    // In trace hooks based on token.symbol set a tokenSymbol field
    // in trace, and after all http methods hook when returning trace
    // add token to trace based on tokenSymbol
    const ethToken = config.get('tokenWhitelist').find(token => token.symbol === 'ETH');

    const response = await request(baseUrl)
      .post(relativeUrl)
      .send({
        ...SAMPLE_DATA.createTraceData(),
        token: {
          address: ethToken.address,
        },
      })
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 201);
    assert.equal(response.body.ownerAddress, SAMPLE_DATA.USER_ADDRESS);
    assert.equal(response.body.tokenAddress, ethToken.address);
    assert.exists(response.body.token);
    assert.exists(response.body.token.foreignAddress);
    assert.exists(response.body.token.decimals);
    expect(response.body.token).to.be.deep.equal(ethToken);
  });

  it('should get unAuthorized error', async () => {
    const response = await request(baseUrl)
      .post(relativeUrl)
      .send(SAMPLE_DATA.createTraceData());
    assert.equal(response.statusCode, 401);
    assert.equal(response.body.code, 401);
  });
  it('should get different slugs for two traces with same title successfully', async () => {
    const response1 = await request(baseUrl)
      .post(relativeUrl)
      .send(SAMPLE_DATA.createTraceData())
      .set({ Authorization: getJwt() });
    const response2 = await request(baseUrl)
      .post(relativeUrl)
      .send(SAMPLE_DATA.createTraceData())
      .set({ Authorization: getJwt() });
    assert.isNotNull(response1.body.slug);
    assert.isNotNull(response2.body.slug);
    assert.notEqual(response1.body.slug, response2.body.slug);
  });

}

function patchMilestoneTestCases() {
  it('should update trace successfully', async () => {
    const description = 'Description updated by test';
    const response = await request(baseUrl)
      .patch(`${relativeUrl}/${SAMPLE_DATA.TRACE_ID}`)
      .send({ status: SAMPLE_DATA.TRACE_STATUSES.IN_PROGRESS, description })
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.description, description);
  });

  it('should not update trace because status not sent in payload', async () => {
    const description = String(new Date());
    const response = await request(baseUrl)
      .patch(`${relativeUrl}/${SAMPLE_DATA.TRACE_ID}`)
      .send({ description })
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 200);
    assert.notEqual(response.body.description, description);
  });

  it('should not update , because data that stored on-chain cant be updated', async () => {
    const updateData = {
      // this should exists otherwise without status mileston should not updated
      status: SAMPLE_DATA.TRACE_STATUSES.IN_PROGRESS,
      maxAmount: '100000000000000000',
      reviewerAddress: SAMPLE_DATA.FAKE_USER_ADDRESS,
      communityId: generateRandomMongoId(),
      recipientAddress: SAMPLE_DATA.FAKE_USER_ADDRESS,
      campaignReviewerAddress: SAMPLE_DATA.FAKE_USER_ADDRESS,
      conversionRateTimestamp: new Date(),
      fiatAmount: 79,
      conversionRate: 7,
      selectedFiatType: 'WBTC',
      date: new Date(),
      token: {
        name: 'FAke ETH',
        address: '0x0',
        foreignAddress: '0x387871cf72c8CC81E3a945402b0E3A2A6C0Ed38a',
        symbol: 'ETH',
        decimals: '6',
      },
      type: 'FakeMilestoneType',
    };
    const response = await request(baseUrl)
      .patch(`${relativeUrl}/${SAMPLE_DATA.TRACE_ID}`)
      .send(updateData)
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 200);
    assert.notEqual(response.body.maxAmount, updateData.maxAmount);
    assert.notEqual(response.body.conversionRateTimestamp, updateData.conversionRateTimestamp);
    assert.notEqual(response.body.campaignReviewerAddress, updateData.campaignReviewerAddress);
    assert.notEqual(response.body.recipientAddress, updateData.recipientAddress);
    assert.notEqual(response.body.communityId, updateData.communityId);
    assert.notEqual(response.body.reviewerAddress, updateData.reviewerAddress);
    assert.notEqual(response.body.date, updateData.date);
    assert.notEqual(response.body.selectedFiatType, updateData.selectedFiatType);
    assert.notEqual(response.body.conversionRate, updateData.conversionRate);
    assert.notEqual(response.body.fiatAmount, updateData.fiatAmount);
    assert.notEqual(response.body.type, updateData.type);
    assert.notEqual(response.body.token, updateData.token);
  });
  it('should get unAuthorized error', async () => {
    const response = await request(baseUrl)
      .patch(`${relativeUrl}/${SAMPLE_DATA.TRACE_ID}`)
      .send(SAMPLE_DATA.createTraceData());
    assert.equal(response.statusCode, 401);
    assert.equal(response.body.code, 401);
  });

  it('should get unAuthorized error because Only the Milestone and Campaign Manager can edit trace', async () => {
    const description = 'Description updated by test';
    const response = await request(baseUrl)
      .patch(`${relativeUrl}/${SAMPLE_DATA.TRACE_ID}`)
      .send({ status: SAMPLE_DATA.TRACE_STATUSES.IN_PROGRESS, description })
      .set({ Authorization: getJwt(SAMPLE_DATA.SECOND_USER_ADDRESS) });
    assert.equal(response.statusCode, 403);
    assert.equal(response.body.code, 403);
  });
}

function deleteMilestoneTestCases() {
  it('should not delete because status is not Proposed or Rejected ', async () => {
    const statusThatCantBeDeleted = [
      SAMPLE_DATA.TRACE_STATUSES.IN_PROGRESS,
      SAMPLE_DATA.TRACE_STATUSES.ARCHIVED,
      SAMPLE_DATA.TRACE_STATUSES.CANCELED,
      SAMPLE_DATA.TRACE_STATUSES.COMPLETED,
      SAMPLE_DATA.TRACE_STATUSES.FAILED,
      SAMPLE_DATA.TRACE_STATUSES.NEEDS_REVIEW,
      SAMPLE_DATA.TRACE_STATUSES.PAID,
      SAMPLE_DATA.TRACE_STATUSES.PAYING,
      SAMPLE_DATA.TRACE_STATUSES.PENDING,
    ];
    /* eslint-disable no-await-in-loop, no-restricted-syntax */
    for (const status of statusThatCantBeDeleted) {
      const createMileStoneData = { ...SAMPLE_DATA.createTraceData() };
      createMileStoneData.status = status;
      createMileStoneData.ownerAddress = SAMPLE_DATA.USER_ADDRESS;

      const trace = await createTrace(createMileStoneData);
      const response = await request(baseUrl)
        .delete(`${relativeUrl}/${trace._id}`)
        .set({ Authorization: getJwt() });
      assert.equal(response.statusCode, 403);
    }
  });

  it('should be successful for deleting trace with status Proposed', async () => {
    const createMileStoneData = { ...SAMPLE_DATA.createTraceData() };
    createMileStoneData.status = SAMPLE_DATA.TRACE_STATUSES.PROPOSED;
    createMileStoneData.ownerAddress = SAMPLE_DATA.USER_ADDRESS;
    const trace = await createTrace(createMileStoneData);
    const response = await request(baseUrl)
      .delete(`${relativeUrl}/${trace._id}`)
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 200);
  });

  it('should be successful for trace with status Rejected', async () => {
    const createMileStoneData = { ...SAMPLE_DATA.createTraceData() };
    createMileStoneData.status = SAMPLE_DATA.TRACE_STATUSES.REJECTED;
    createMileStoneData.ownerAddress = SAMPLE_DATA.USER_ADDRESS;
    const trace = await createTrace(createMileStoneData);
    const response = await request(baseUrl)
      .delete(`${relativeUrl}/${trace._id}`)
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 200);
  });

  it("should get 403 , users cant delete other's  trace", async () => {
    const createMileStoneData = { ...SAMPLE_DATA.createTraceData() };
    createMileStoneData.status = SAMPLE_DATA.TRACE_STATUSES.REJECTED;
    createMileStoneData.ownerAddress = SAMPLE_DATA.USER_ADDRESS;
    const trace = await createTrace(createMileStoneData);
    const response = await request(baseUrl)
      .delete(`${relativeUrl}/${trace._id}`)
      .set({ Authorization: getJwt(SAMPLE_DATA.SECOND_USER_ADDRESS) });
    // TODO this testCase is for a bug, when bug fixed this testCase should fix and probably the status should be 403 instead of 200
    assert.equal(response.statusCode, 403);
  });

  it('should be successful , delete Proposed trace', async () => {
    const createMileStoneData = { ...SAMPLE_DATA.createTraceData() };
    createMileStoneData.status = SAMPLE_DATA.TRACE_STATUSES.REJECTED;
    createMileStoneData.ownerAddress = SAMPLE_DATA.USER_ADDRESS;
    const trace = await createTrace(createMileStoneData);
    const response = await request(baseUrl)
      .delete(`${relativeUrl}/${trace._id}`)
      .set({ Authorization: getJwt(SAMPLE_DATA.USER_ADDRESS) });
    // TODO this testCase is for a bug, when bug fixed this testCase should fix and probably the status should be 403 instead of 200
    assert.equal(response.statusCode, 200);
  });

  it('should get unAuthorized error', async () => {
    const response = await request(baseUrl).delete(`${relativeUrl}/${SAMPLE_DATA.TRACE_ID}`);
    assert.equal(response.statusCode, 401);
    assert.equal(response.body.code, 401);
  });
}

it('should traces service registration be ok', () => {
  const service = app.service('traces');
  assert.ok(service, 'Registered the service');
});

describe(`Test GET  ${relativeUrl}`, getMilestoneTestCases);
describe(`Test POST  ${relativeUrl}`, postMilestoneTestCases);
describe(`Test PATCH  ${relativeUrl}`, patchMilestoneTestCases);
describe(`Test DELETE  ${relativeUrl}`, deleteMilestoneTestCases);

before(() => {
  app = getFeatherAppInstance();
});
