const request = require('supertest');
const config = require('config');
const { assert, expect } = require('chai');
const { getJwt, SAMPLE_DATA, generateRandomMongoId } = require('../../../test/testUtility');
const { getFeatherAppInstance } = require('../../app');

let app;
const baseUrl = config.get('givethFathersBaseUrl');
const relativeUrl = '/milestones';

async function createMilestone(data) {
  const response = await request(baseUrl)
    .post(relativeUrl)
    .send(data)
    .set({ Authorization: getJwt() });
  return response.body;
}

function getMilestoneTestCases() {
  it('should get successful result', async function() {
    const response = await request(baseUrl).get(relativeUrl);
    assert.equal(response.statusCode, 200);
    assert.exists(response.body.data);
    assert.notEqual(response.body.data.length, 0);
  });
  it('getMileStoneDetail', async function() {
    const response = await request(baseUrl).get(`${relativeUrl}/${SAMPLE_DATA.MILESTONE_ID}`);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.ownerAddress, SAMPLE_DATA.USER_ADDRESS);
  });
}

function postMilestoneTestCases() {
  it('should create milestone successfully', async function() {
    const response = await request(baseUrl)
      .post(relativeUrl)
      .send(SAMPLE_DATA.createMilestoneData())
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 201);
    assert.equal(response.body.ownerAddress, SAMPLE_DATA.USER_ADDRESS);
  });

  it('should create milestone , token must be returned', async function() {
    // In milestone hooks based on token.symbol set a tokenSymbol field
    // in milestone, and after all http methods hook when returning milestone
    // add token to milestone based on tokenSymbol
    const ethToken = config.get('tokenWhitelist').find(token => token.symbol === 'ETH');

    const response = await request(baseUrl)
      .post(relativeUrl)
      .send({
        ...SAMPLE_DATA.createMilestoneData(),
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

  it('should get unAuthorized error', async function() {
    const response = await request(baseUrl)
      .post(relativeUrl)
      .send(SAMPLE_DATA.createMilestoneData());
    assert.equal(response.statusCode, 401);
    assert.equal(response.body.code, 401);
  });
}

function patchMilestoneTestCases() {
  it('should update milestone successfully', async function() {
    const description = 'Description updated by test';
    const response = await request(baseUrl)
      .patch(`${relativeUrl}/${SAMPLE_DATA.MILESTONE_ID}`)
      .send({ status: SAMPLE_DATA.MILESTONE_STATUSES.IN_PROGRESS, description })
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.description, description);
  });

  it('should not update milestone because status not sent in payload', async function() {
    const description = String(new Date());
    const response = await request(baseUrl)
      .patch(`${relativeUrl}/${SAMPLE_DATA.MILESTONE_ID}`)
      .send({ description })
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 200);
    assert.notEqual(response.body.description, description);
  });

  it('should not update , because data that stored on-chain cant be updated', async function() {
    const updateData = {
      // this should exists otherwise without status mileston should not updated
      status: SAMPLE_DATA.MILESTONE_STATUSES.IN_PROGRESS,
      maxAmount: '100000000000000000',
      reviewerAddress: SAMPLE_DATA.FAKE_USER_ADDRESS,
      dacId: generateRandomMongoId(),
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
      .patch(`${relativeUrl}/${SAMPLE_DATA.MILESTONE_ID}`)
      .send(updateData)
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 200);
    assert.notEqual(response.body.maxAmount, updateData.maxAmount);
    assert.notEqual(response.body.conversionRateTimestamp, updateData.conversionRateTimestamp);
    assert.notEqual(response.body.campaignReviewerAddress, updateData.campaignReviewerAddress);
    assert.notEqual(response.body.recipientAddress, updateData.recipientAddress);
    assert.notEqual(response.body.dacId, updateData.dacId);
    assert.notEqual(response.body.reviewerAddress, updateData.reviewerAddress);
    assert.notEqual(response.body.date, updateData.date);
    assert.notEqual(response.body.selectedFiatType, updateData.selectedFiatType);
    assert.notEqual(response.body.conversionRate, updateData.conversionRate);
    assert.notEqual(response.body.fiatAmount, updateData.fiatAmount);
    assert.notEqual(response.body.type, updateData.type);
    assert.notEqual(response.body.token, updateData.token);
  });
  it('should get unAuthorized error', async function() {
    const response = await request(baseUrl)
      .patch(`${relativeUrl}/${SAMPLE_DATA.MILESTONE_ID}`)
      .send(SAMPLE_DATA.createMilestoneData());
    assert.equal(response.statusCode, 401);
    assert.equal(response.body.code, 401);
  });

  it('should get unAuthorized error because Only the Milestone and Campaign Manager can edit milestone', async function() {
    const description = 'Description updated by test';
    const response = await request(baseUrl)
      .patch(`${relativeUrl}/${SAMPLE_DATA.MILESTONE_ID}`)
      .send({ status: SAMPLE_DATA.MILESTONE_STATUSES.IN_PROGRESS, description })
      .set({ Authorization: getJwt(SAMPLE_DATA.SECOND_USER_ADDRESS) });
    assert.equal(response.statusCode, 403);
    assert.equal(response.body.code, 403);
  });
}

function deleteMilestoneTestCases() {
  it('should not delete because status is not Proposed or Rejected ', async function() {
    const statusThatCantBeDeleted = [
      SAMPLE_DATA.MILESTONE_STATUSES.IN_PROGRESS,
      SAMPLE_DATA.MILESTONE_STATUSES.ARCHIVED,
      SAMPLE_DATA.MILESTONE_STATUSES.CANCELED,
      SAMPLE_DATA.MILESTONE_STATUSES.COMPLETED,
      SAMPLE_DATA.MILESTONE_STATUSES.FAILED,
      SAMPLE_DATA.MILESTONE_STATUSES.NEEDS_REVIEW,
      SAMPLE_DATA.MILESTONE_STATUSES.PAID,
      SAMPLE_DATA.MILESTONE_STATUSES.PAYING,
      SAMPLE_DATA.MILESTONE_STATUSES.PENDING,
    ];
    /* eslint-disable no-await-in-loop, no-restricted-syntax */
    for (const status of statusThatCantBeDeleted) {
      const createMileStoneData = { ...SAMPLE_DATA.createMilestoneData() };
      createMileStoneData.status = status;
      createMileStoneData.ownerAddress = SAMPLE_DATA.USER_ADDRESS;

      const milestone = await createMilestone(createMileStoneData);
      const response = await request(baseUrl)
        .delete(`${relativeUrl}/${milestone._id}`)
        .set({ Authorization: getJwt() });
      assert.equal(response.statusCode, 403);
    }
  });

  it('should be successful for milestone with status Proposed', async function() {
    const createMileStoneData = { ...SAMPLE_DATA.createMilestoneData() };
    createMileStoneData.status = SAMPLE_DATA.MILESTONE_STATUSES.PROPOSED;
    createMileStoneData.ownerAddress = SAMPLE_DATA.USER_ADDRESS;
    const milestone = await createMilestone(createMileStoneData);
    const response = await request(baseUrl)
      .delete(`${relativeUrl}/${milestone._id}`)
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 200);
  });

  it('should be successful for milestone with status Rejected', async function() {
    const createMileStoneData = { ...SAMPLE_DATA.createMilestoneData() };
    createMileStoneData.status = SAMPLE_DATA.MILESTONE_STATUSES.REJECTED;
    createMileStoneData.ownerAddress = SAMPLE_DATA.USER_ADDRESS;
    const milestone = await createMilestone(createMileStoneData);
    const response = await request(baseUrl)
      .delete(`${relativeUrl}/${milestone._id}`)
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 200);
  });

  it("should get 403 , users cant delete other's  milestone", async function() {
    const createMileStoneData = { ...SAMPLE_DATA.createMilestoneData() };
    createMileStoneData.status = SAMPLE_DATA.MILESTONE_STATUSES.REJECTED;
    createMileStoneData.ownerAddress = SAMPLE_DATA.USER_ADDRESS;
    const milestone = await createMilestone(createMileStoneData);
    const response = await request(baseUrl)
      .delete(`${relativeUrl}/${milestone._id}`)
      .set({ Authorization: getJwt(SAMPLE_DATA.SECOND_USER_ADDRESS) });
    // TODO this testCase is for a bug, when bug fixed this testCase should fix and probably the status should be 403 instead of 200
    assert.equal(response.statusCode, 403);
  });

  it('should be successful , delete Proposed milestone', async function() {
    const createMileStoneData = { ...SAMPLE_DATA.createMilestoneData() };
    createMileStoneData.status = SAMPLE_DATA.MILESTONE_STATUSES.REJECTED;
    createMileStoneData.ownerAddress = SAMPLE_DATA.USER_ADDRESS;
    const milestone = await createMilestone(createMileStoneData);
    const response = await request(baseUrl)
      .delete(`${relativeUrl}/${milestone._id}`)
      .set({ Authorization: getJwt(SAMPLE_DATA.USER_ADDRESS) });
    // TODO this testCase is for a bug, when bug fixed this testCase should fix and probably the status should be 403 instead of 200
    assert.equal(response.statusCode, 200);
  });

  it('should get unAuthorized error', async function() {
    const response = await request(baseUrl).delete(`${relativeUrl}/${SAMPLE_DATA.MILESTONE_ID}`);
    assert.equal(response.statusCode, 401);
    assert.equal(response.body.code, 401);
  });
}

it('should milestones service registration be ok', () => {
  const service = app.service('milestones');
  assert.ok(service, 'Registered the service');
});

describe(`Test GET  ${relativeUrl}`, getMilestoneTestCases);
describe(`Test POST  ${relativeUrl}`, postMilestoneTestCases);
describe(`Test PATCH  ${relativeUrl}`, patchMilestoneTestCases);
describe(`Test DELETE  ${relativeUrl}`, deleteMilestoneTestCases);

before(() => {
  app = getFeatherAppInstance();
});
