const { assert } = require('chai');
const { getPledgeAdmin } = require('./conversationAndEmailHandler');
const { getFeatherAppInstance } = require('../app');
const { AdminTypes } = require('../models/pledgeAdmins.model');
const { SAMPLE_DATA, generateRandomMongoId, assertThrowsAsync } = require('../../test/testUtility');

let app;

function getPledgeAdminTestCases() {
  it('should find dac by id', async () => {
    const dac = await getPledgeAdmin(app, AdminTypes.DAC, SAMPLE_DATA.DAC_ID);
    assert.isOk(dac);
  });
  it('should find campaign by id', async () => {
    const campaign = await getPledgeAdmin(app, AdminTypes.CAMPAIGN, SAMPLE_DATA.CAMPAIGN_ID);
    assert.isOk(campaign);
  });
  it('should find campaign by id', async () => {
    const milestone = await getPledgeAdmin(app, AdminTypes.MILESTONE, SAMPLE_DATA.MILESTONE_ID);
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
      await getPledgeAdmin(app, AdminTypes.MILESTONE, fakeId);
    };
    await assertThrowsAsync(badFunc, `No record found for id '${fakeId}'`);
  });
}

describe('getPledgeAdmin() test cases', getPledgeAdminTestCases);

before(() => {
  app = getFeatherAppInstance();
});
