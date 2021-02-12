const { assert } = require('chai');
const { findCampaignRelatedDacs } = require('./campaign.repository');
const { getFeatherAppInstance } = require('../app');
const { SAMPLE_DATA } = require('../../test/testUtility');

const app = getFeatherAppInstance();

function findCampaignRelatedDacsTestCases() {
  it('should find campaign related dac', async () => {
    const dacs = await findCampaignRelatedDacs(app, SAMPLE_DATA.CAMPAIGN_PROJECT_ID);
    assert.isArray(dacs);
    assert.equal(dacs.length, 1);
    assert.equal(String(dacs[0]._id), SAMPLE_DATA.DAC_ID);
    assert.equal(String(dacs[0].owner.address), SAMPLE_DATA.DAC_OWNER_ADDRESS);
  });

  it('should find no dacs for invalid projectId', async () => {
    const dacs = await findCampaignRelatedDacs(app, 9999);
    assert.isArray(dacs);
    assert.isEmpty(dacs);
  });
}

describe('findCampaignRelatedDacs() test cases', findCampaignRelatedDacsTestCases);
