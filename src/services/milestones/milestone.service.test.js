const request = require('supertest');
const config = require('config');
const { assert } = require('chai');
const { getJwt } = require('../../../test/testUtility');

const testAuthorization = getJwt();

const baseUrl = config.get('givethFathersBaseUrl');
const relativeUrl = '/milestones';

function getMilestoneTestCases() {
  it('should get successful result', async function() {
    const response = await request(baseUrl)
      .get(relativeUrl);
    assert.equal(response.statusCode, 200);
    assert.exists(response.body.data);
    assert.notEqual(response.body.data.length, 0);
  });

}

describe('test get ' + relativeUrl, getMilestoneTestCases);
