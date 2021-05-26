const { assert } = require('chai');
const { getPledgeAdmin } = require('./conversationAndEmailHandler');
const { getFeatherAppInstance } = require('../app');
const { AdminTypes } = require('../models/pledgeAdmins.model');
const { SAMPLE_DATA, generateRandomMongoId, assertThrowsAsync } = require('../../test/testUtility');

let app;

function getPledgeAdminTestCases() {
  it('should find community by id', async () => {
    const community = await getPledgeAdmin(app, AdminTypes.COMMUNITY, SAMPLE_DATA.COMMUNITY_ID);
    assert.isOk(community);
  });
  it('should find campaign by id', async () => {
    const campaign = await getPledgeAdmin(app, AdminTypes.CAMPAIGN, SAMPLE_DATA.CAMPAIGN_ID);
    assert.isOk(campaign);
  });
  it('should find campaign by id', async () => {
    const milestone = await getPledgeAdmin(app, AdminTypes.TRACE, SAMPLE_DATA.TRACE_ID);
    assert.isOk(milestone);
  });
  it('should find user by id', async () => {
    const user = await getPledgeAdmin(
      app,
      'something else should consider user',
      SAMPLE_DATA.USER_ADDRESS,
    );
    assert.isOk(user);
  });
  it('should throw exception, fake mongoId', async () => {
    const fakeId = generateRandomMongoId();
    const badFunc = async () => {
      await getPledgeAdmin(app, AdminTypes.TRACE, fakeId);
    };
    await assertThrowsAsync(badFunc, `No record found for id '${fakeId}'`);
  });
}

describe('getPledgeAdmin() test cases', getPledgeAdminTestCases);

before(() => {
  app = getFeatherAppInstance();
});
