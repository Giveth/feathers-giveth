const request = require('supertest');
const config = require('config');
const { assert } = require('chai');
const { SAMPLE_DATA, getJwt } = require('../../../test/testUtility');
const { getFeatherAppInstance } = require('../../app');

const { givethIoInfo } = config;
const baseUrl = config.get('givethFathersBaseUrl');
const relativeUrl = '/verifyCampaigns';
const app = getFeatherAppInstance();

function PostVerifyCampaignsTestCases() {
  it('Change campaign info verified and archived successfully', async () => {
    const campaign = await app.service('campaigns').create({
      ...SAMPLE_DATA.CREATE_CAMPAIGN_DATA,
      status: SAMPLE_DATA.CAMPAIGN_STATUSES.ACTIVE,
      verified: false,
    });
    const response = await request(baseUrl)
      .post(`${relativeUrl}`)
      .send({
        slug: campaign.slug,
        archived: true,
        verified: true,
      })
      .set({
        Authorization: `Basic ${Buffer.from(
          `${givethIoInfo.username}:${givethIoInfo.password}`,
        ).toString('base64')}`,
      });
    assert.equal(response.body.slug, campaign.slug);
    assert.isTrue(response.body.verified);
    assert.equal(response.body.status, SAMPLE_DATA.CAMPAIGN_STATUSES.ARCHIVED);
  });
  it('Change campaign info verified true  successfully', async () => {
    const campaign = await app.service('campaigns').create({
      ...SAMPLE_DATA.CREATE_CAMPAIGN_DATA,
      status: SAMPLE_DATA.CAMPAIGN_STATUSES.ACTIVE,
      verified: false,
    });
    const response = await request(baseUrl)
      .post(`${relativeUrl}`)
      .send({
        slug: campaign.slug,
        verified: true,
      })
      .set({
        Authorization: `Basic ${Buffer.from(
          `${givethIoInfo.username}:${givethIoInfo.password}`,
        ).toString('base64')}`,
      });
    assert.equal(response.body.slug, campaign.slug);
    assert.isTrue(response.body.verified);
    assert.equal(response.body.status, SAMPLE_DATA.CAMPAIGN_STATUSES.ACTIVE);
  });
  it('Change campaign info verified false  successfully', async () => {
    const campaign = await app.service('campaigns').create({
      ...SAMPLE_DATA.CREATE_CAMPAIGN_DATA,
      status: SAMPLE_DATA.CAMPAIGN_STATUSES.ACTIVE,
      verified: true,
    });
    const response = await request(baseUrl)
      .post(`${relativeUrl}`)
      .send({
        slug: campaign.slug,
        verified: false,
      })
      .set({
        Authorization: `Basic ${Buffer.from(
          `${givethIoInfo.username}:${givethIoInfo.password}`,
        ).toString('base64')}`,
      });
    assert.equal(response.body.slug, campaign.slug);
    assert.isFalse(response.body.verified);
    assert.equal(response.body.status, SAMPLE_DATA.CAMPAIGN_STATUSES.ACTIVE);
  });
  it('Change campaign info archived  true successfully', async () => {
    const campaign = await app.service('campaigns').create({
      ...SAMPLE_DATA.CREATE_CAMPAIGN_DATA,
      status: SAMPLE_DATA.CAMPAIGN_STATUSES.ACTIVE,
      verified: false,
    });
    const response = await request(baseUrl)
      .post(`${relativeUrl}`)
      .send({
        slug: campaign.slug,
        archived: true,
      })
      .set({
        Authorization: `Basic ${Buffer.from(
          `${givethIoInfo.username}:${givethIoInfo.password}`,
        ).toString('base64')}`,
      });
    assert.equal(response.body.slug, campaign.slug);
    assert.isFalse(response.body.verified);
    assert.equal(response.body.status, SAMPLE_DATA.CAMPAIGN_STATUSES.ARCHIVED);
  });
  it('Change campaign info archived  false successfully', async () => {
    const campaign = await app.service('campaigns').create({
      ...SAMPLE_DATA.CREATE_CAMPAIGN_DATA,
      status: SAMPLE_DATA.CAMPAIGN_STATUSES.ARCHIVED,
      verified: false,
    });
    const response = await request(baseUrl)
      .post(`${relativeUrl}`)
      .send({
        slug: campaign.slug,
        archived: false,
      })
      .set({
        Authorization: `Basic ${Buffer.from(
          `${givethIoInfo.username}:${givethIoInfo.password}`,
        ).toString('base64')}`,
      });
    assert.equal(response.body.slug, campaign.slug);
    assert.isFalse(response.body.verified);
    assert.equal(response.body.status, SAMPLE_DATA.CAMPAIGN_STATUSES.ACTIVE);
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
