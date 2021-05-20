const request = require('supertest');
const config = require('config');
const { assert } = require('chai');
const { getJwt, SAMPLE_DATA, generateRandomEtheriumAddress } = require('../../../test/testUtility');
const { getFeatherAppInstance } = require('../../app');

let app;
const baseUrl = config.get('givethFathersBaseUrl');
const relativeUrl = '/events';

function getEventsTestCases() {
  it('should return successful result', async () => {
    const response = await request(baseUrl).get(relativeUrl);
    assert.equal(response.statusCode, 200);
    assert.isArray(response.body.data);
  });
}

function postEventsTestCases() {
  it('should return 405, POST is disallowed', async function() {
    const response = await request(baseUrl)
      .post(relativeUrl)
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 405);
    assert.equal(response.body.code, 405);
  });
}

function postEventsPendingRecipientTestCases() {
  it('should add pendindRecipientAddress to milestone', async () => {
    const recipientAddress = generateRandomEtheriumAddress();
    await app.service('events').create({
      event: 'RecipientChanged',
      blockNumber: 4155137,
      transactionHash: '0xa8385aaf246bcd3f12b1a48368d10bc39d1c5988c159e18134587ce3e0c5d8e6',
      transactionIndex: 4,
      address: '0x2e215b2Dd5383826AC7636443Ca38bcB8Fc08D17',
      blockHash: '0xdfbb4f6387dacd8e10522bc73ce9f44c0a7c7229cfb26fbb4ebe8d5aeb36559c',
      logIndex: 1,
      id: 'log_11fc0203',
      returnValues: {
        idProject: SAMPLE_DATA.MILESTONE_PROJECT_ID,
        recipient: recipientAddress,
      },
    });
    const milestone = await app.service('traces').get(SAMPLE_DATA.TRACE_ID);
    assert.equal(milestone.pendingRecipientAddress, recipientAddress);
  });
}

function putEventsTestCases() {
  it('should return 405, PUT is disallowed', async function() {
    const response = await request(baseUrl)
      .put(relativeUrl)
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 405);
    assert.equal(response.body.code, 405);
  });
}

function deleteEventsTestCases() {
  it('should return 405, DELETE is disallowed', async function() {
    const response = await request(baseUrl)
      .delete(relativeUrl)
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 405);
    assert.equal(response.body.code, 405);
  });
}

function patchEventsTestCases() {
  it('should return 405, PATCH is disallowed', async function() {
    const response = await request(baseUrl)
      .patch(relativeUrl)
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 405);
    assert.equal(response.body.code, 405);
  });
}

it('should events service registration be ok', () => {
  const service = app.service('events');
  assert.ok(service, 'Registered the service');
});

describe(`Test GET ${relativeUrl}`, getEventsTestCases);
describe(`Test POST ${relativeUrl}`, postEventsTestCases);
describe(
  `Test POST ${relativeUrl} create pendingRecipientAddress`,
  postEventsPendingRecipientTestCases,
);
describe(`Test PUT ${relativeUrl}`, putEventsTestCases);
describe(`Test DELETE ${relativeUrl}`, deleteEventsTestCases);
describe(`Test PATCH ${relativeUrl}`, patchEventsTestCases);

before(() => {
  app = getFeatherAppInstance();
});
