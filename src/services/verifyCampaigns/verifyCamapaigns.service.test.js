const request = require('supertest');
const config = require('config');
const { assert } = require('chai');
const { SAMPLE_DATA, getJwt, generateRandomTxHash } = require('../../../test/testUtility');

const { givethIoInfo } = config;
const baseUrl = config.get('givethFathersBaseUrl');
const relativeUrl = '/verifyCampaigns';

function PostVerifyCampaignsTestCases() {
  it('Change campaign info verifed and archived susssfully', async () => {

    const campaign =await app.service('campaigns').create(
      {
        ...SAMPLE_DATA.CREATE_CAMPAIGN_DATA,
          status : SAMPLE_DATA.CAMPAIGN_STATUSES.ACTIVE,
        verified:false
      })
    const response = await request(baseUrl)
      .post(`${relativeUrl}`)
      .send({
        slug,
        txHash: generateRandomTxHash(),
        url: '/ipfs/dshdkjsahdkahkdsa',
      })
      .set({ Authorization: getJwt(SAMPLE_DATA.GIVETH_IO_PROJECT_OWNER_ADDRESS) });
    assert.equal(response.statusCode, 201);
    assert.equal(response.body.slug, slug);
    assert.isTrue(response.body.verified);
  });

  it('Get 401 when when sending accessToken instead of basicAuthentication', async () => {
    const slug = 'test';
    const response = await request(baseUrl)
      .post(`${relativeUrl}`)
      .send({
        slug,
        verified: false,
      })
      .set({ Authorization: getJwt(SAMPLE_DATA.USER_ADDRESS) });

    assert.equal(response.statusCode, 401);
  });

  it('Get 401 when not sending basicAuthentication', async () => {
    const slug = 'test';
    const response = await request(baseUrl)
      .post(`${relativeUrl}`)
      .send({
        slug,
        verified: true,
      });

    assert.equal(response.statusCode, 401);
  });
}

describe(`Test POST ${relativeUrl}`, PostVerifyCampaignsTestCases);
