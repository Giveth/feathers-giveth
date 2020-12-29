const request = require('supertest');
const config = require('config');
const { assert } = require('chai');
const { getJwt, SAMPLE_DATA } = require('../../../test/testUtility');
const { getFeatherAppInstance } = require('../../app');

const app = getFeatherAppInstance();
const baseUrl = config.get('givethFathersBaseUrl');
const relativeUrl = '/conversations';

function getConversationsTestCases() {
  it('should return some values', async function() {
    const response = await request(baseUrl).get(relativeUrl);
    assert.equal(response.statusCode, 200);
    assert.isArray(response.body.data);
  });
}

function postConversationsTestCases() {
  // TODO should test more testCases for creating milestone, different roles on milestone and etc
  it('should return create conversation successfully', async function() {
    const payload = {
      milestoneId: SAMPLE_DATA.MILESTONE_ID,
      ownerAddress: SAMPLE_DATA.USER_ADDRESS,
      performedByRole: 'Anonymous role',
      message:
        'I have no role in this milestone or campaign or whatever, but I can comment on this milestone, is this ok?',
      messageContext: 'comment',
    };
    const response = await request(baseUrl)
      .post(relativeUrl)
      .set({ Authorization: getJwt() })
      .send(payload);
    assert.equal(response.statusCode, 201);
    assert.equal(response.body.message, payload.message);
    assert.equal(response.body.messageContext, payload.messageContext);
  });
}

function patchConversationsTestCases() {
  it('should get 403, PATCH is allowed for internal calls', async function() {
    const response = await request(baseUrl)
      .patch(relativeUrl)
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 403);
    assert.equal(response.body.code, 403);
  });
}

function deleteConversationsTestCases() {
  it('should get 405, DEELTE method is no allowed', async function() {
    const response = await request(baseUrl)
      .delete(relativeUrl)
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 405);
    assert.equal(response.body.code, 405);
  });
}

function putConversationsTestCases() {
  it('should get 405, PUT method is no allowed', async function() {
    const response = await request(baseUrl)
      .put(relativeUrl)
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 405);
    assert.equal(response.body.code, 405);
  });
}

it('should conversations service registration be ok', () => {
  const conversationService = app.service('conversations');
  assert.ok(conversationService, 'Registered the service');
});

describe(`Test GET ${relativeUrl}`, getConversationsTestCases);
describe(`Test POST ${relativeUrl}`, postConversationsTestCases);
describe(`Test DELETE ${relativeUrl}`, deleteConversationsTestCases);
describe(`Test PUT ${relativeUrl}`, putConversationsTestCases);
describe(`Test PATCH ${relativeUrl}`, patchConversationsTestCases);
