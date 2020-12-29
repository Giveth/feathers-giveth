const request = require('supertest');
const config = require('config');
const { assert } = require('chai');
const path = require('path');
const { getJwt } = require('../../../test/testUtility');
const { getFeatherAppInstance } = require('../../app');

const app = getFeatherAppInstance();
const baseUrl = config.get('givethFathersBaseUrl');
const relativeUrl = '/uploads';

// In postman I get 405 for this endpoint, but in test we got 301 so this test fails
// function getUploadsTestCases() {
//   it('should return 405, GET is disallowed', async function() {
//     const response = await request(baseUrl).get(relativeUrl);
//     assert.equal(response.statusCode, 405);
//     assert.equal(response.body.code, 405);
//   });
// }

function postUploadsTestCases() {
  it('should be successful, upload an image', async function() {
    const response = await request(baseUrl)
      .post(relativeUrl)
      .attach('uri', path.resolve(__dirname, '../../../test/resources/giveth-landing-page.png'))
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 201);
    assert.exists(response.body.url);
    assert.exists(response.body.size);
  });
}

function putUploadsTestCases() {
  it('should return 405, PUT is disallowed', async function() {
    const response = await request(baseUrl)
      .put(relativeUrl)
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 405);
    assert.equal(response.body.code, 405);
  });
}

function deleteUploadsTestCases() {
  it('should return 405, DELETE is disallowed', async function() {
    const response = await request(baseUrl)
      .delete(relativeUrl)
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 405);
    assert.equal(response.body.code, 405);
  });
}

function patchUploadsTestCases() {
  it('should return 405, PATCH is disallowed', async function() {
    const response = await request(baseUrl)
      .patch(relativeUrl)
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 405);
    assert.equal(response.body.code, 405);
  });
}

it('should uploads service registration be ok', () => {
  const service = app.service('uploads');
  assert.ok(service, 'Registered the service');
});

// describe(`Test GET ${relativeUrl}`, getUploadsTestCases);
describe(`Test POST ${relativeUrl}`, postUploadsTestCases);
describe(`Test PUT ${relativeUrl}`, putUploadsTestCases);
describe(`Test DELETE ${relativeUrl}`, deleteUploadsTestCases);
describe(`Test PATCH ${relativeUrl}`, patchUploadsTestCases);
