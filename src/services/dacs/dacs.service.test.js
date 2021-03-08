const request = require('supertest');
const config = require('config');
const { assert } = require('chai');
const { getJwt, SAMPLE_DATA, generateRandomTransactionHash } = require('../../../test/testUtility');
const { getFeatherAppInstance } = require('../../app');

let app;

const baseUrl = config.get('givethFathersBaseUrl');
const relativeUrl = '/dacs';

async function createDac(data) {
  const response = await request(baseUrl)
    .post(relativeUrl)
    .send(data)
    .set({ Authorization: getJwt() });
  return response.body;
}

function getDacTestCases() {
  it('should get successful result', async function() {
    const response = await request(baseUrl).get(relativeUrl);
    assert.equal(response.statusCode, 200);
    assert.exists(response.body.data);
    assert.notEqual(response.body.data.length, 0);
  });
  it('getDacDetail', async function() {
    const response = await request(baseUrl).get(`${relativeUrl}/${SAMPLE_DATA.DAC_ID}`);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.ownerAddress, SAMPLE_DATA.USER_ADDRESS);
  });
}

function postDacTestCases() {
  it('should create dac successfully', async function() {
    const response = await request(baseUrl)
      .post(relativeUrl)
      .send(SAMPLE_DATA.CREATE_DAC_DATA)
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 201);
    assert.equal(response.body.ownerAddress, SAMPLE_DATA.USER_ADDRESS);
  });
  it('should get unAuthorized error', async function() {
    const response = await request(baseUrl)
      .post(relativeUrl)
      .send(SAMPLE_DATA.CREATE_DAC_DATA);
    assert.equal(response.statusCode, 401);
    assert.equal(response.body.code, 401);
  });
  it('should get different slugs for two dacs with same title successfully', async function() {
    const response1 = await request(baseUrl)
      .post(relativeUrl)
      .send(SAMPLE_DATA.CREATE_DAC_DATA)
      .set({ Authorization: getJwt() });
    const response2 = await request(baseUrl)
      .post(relativeUrl)
      .send(SAMPLE_DATA.CREATE_DAC_DATA)
      .set({ Authorization: getJwt() });
    assert.isNotNull(response1.body.slug);
    assert.isNotNull(response2.body.slug);
    assert.notEqual(response1.body.slug, response2.body.slug);
  });
}

function patchDacTestCases() {
  it('should update dac successfully', async function() {
    const description = 'Description updated by test';
    const response = await request(baseUrl)
      .patch(`${relativeUrl}/${SAMPLE_DATA.DAC_ID}`)
      .send({ status: SAMPLE_DATA.CAMPAIGN_STATUSES.IN_PROGRESS, description })
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.description, description);
  });

  it('should update dac successfully, owner can update the dac', async function() {
    const dac = await createDac({
      ...SAMPLE_DATA.CREATE_DAC_DATA,
      status: SAMPLE_DATA.DacStatus.PENDING,
    });
    const response = await request(baseUrl)
      .patch(`${relativeUrl}/${dac._id}`)
      .send({ status: SAMPLE_DATA.CAMPAIGN_STATUSES.CANCELED })
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.status, SAMPLE_DATA.CAMPAIGN_STATUSES.CANCELED);
  });

  it('should update dac successfully,but txHash cant be updated', async function() {
    const dac = await createDac({
      ...SAMPLE_DATA.CREATE_DAC_DATA,
    });
    const txHash = generateRandomTransactionHash();
    const response = await request(baseUrl)
      .patch(`${relativeUrl}/${dac._id}`)
      .send({ txHash })
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 200);
    assert.notEqual(response.txHash, txHash);
  });

  it('should get unAuthorized error', async function() {
    const response = await request(baseUrl)
      .patch(`${relativeUrl}/${SAMPLE_DATA.DAC_ID}`)
      .send(SAMPLE_DATA.CREATE_DAC_DATA);
    assert.equal(response.statusCode, 401);
    assert.equal(response.body.code, 401);
  });

  it('should get unAuthorized error because Only the Dac owner can edit dac', async function() {
    const description = 'Description updated by test';
    const response = await request(baseUrl)
      .patch(`${relativeUrl}/${SAMPLE_DATA.DAC_ID}`)
      .send({ status: SAMPLE_DATA.CAMPAIGN_STATUSES.IN_PROGRESS, description })
      .set({ Authorization: getJwt(SAMPLE_DATA.SECOND_USER_ADDRESS) });
    assert.equal(response.statusCode, 403);
    assert.equal(response.body.code, 403);
  });
}

function deleteDacTestCases() {
  it('should not delete because its disallowed', async function() {
    const createDacData = { ...SAMPLE_DATA.CREATE_DAC_DATA };
    const dac = await createDac(createDacData);
    const response = await request(baseUrl)
      .delete(`${relativeUrl}/${dac._id}`)
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 405);
  });

  it('should get unAuthorized error', async function() {
    const response = await request(baseUrl).delete(`${relativeUrl}/${SAMPLE_DATA.DAC_ID}`);
    assert.equal(response.statusCode, 401);
    assert.equal(response.body.code, 401);
  });
}

it('should dacs service registration be ok', () => {
  const dacService = app.service('dacs');
  assert.ok(dacService, 'Registered the service');
});

describe(`Test GET  ${relativeUrl}`, getDacTestCases);
describe(`Test POST  ${relativeUrl}`, postDacTestCases);
describe(`Test PATCH  ${relativeUrl}`, patchDacTestCases);
describe(`Test DELETE  ${relativeUrl}`, deleteDacTestCases);

before(() => {
  app = getFeatherAppInstance();
});
