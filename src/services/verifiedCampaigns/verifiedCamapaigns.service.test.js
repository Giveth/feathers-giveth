const request = require('supertest');
const config = require('config');
const { assert } = require('chai');
const {
  SAMPLE_DATA,
  getJwt,
  generateRandomTxHash,
  generateRandomNumber, generateRandomMongoId,
} = require('../../../test/testUtility');
const { getFeatherAppInstance } = require('../../app');

const baseUrl = config.get('givethFathersBaseUrl');
const relativeUrl = '/verifiedCampaigns';
const app = getFeatherAppInstance();

const { givethIoInfo } = config;
function GetVerifiedCampaignsTestCases() {
  it('get projectInfo with right input data', async () => {
    const slug = 'test';
    const response = await request(baseUrl).get(
      `${relativeUrl}?slug=${slug}&userAddress=${SAMPLE_DATA.GIVETH_IO_PROJECT_OWNER_ADDRESS}`,
    );
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.slug, slug);
    assert.equal(response.body.reviewerAddress, config.givethIoProjectsReviewerAddress);
    assert.exists(response.body.owner);
    assert.equal(response.body.owner.address, SAMPLE_DATA.GIVETH_IO_PROJECT_OWNER_ADDRESS);
    assert.exists(response.body.owner.email);
    assert.exists(response.body.owner.location);
    assert.exists(response.body.id);
  });
  it('Get 403 for getting projectInfo with invalid walletAddress', async () => {
    const slug = 'test';
    const response = await request(baseUrl).get(
      `${relativeUrl}?slug=${slug}&userAddress=${SAMPLE_DATA.USER_ADDRESS}`,
    );
    assert.equal(response.statusCode, 403);
  });
}
function PostVerifiedCampaignsTestCases() {
  it('Create campaign with gievthIo project successful', async () => {
    const slug = 'test';
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

  it('Get 403 for creating campaign with invalid walletAddress', async () => {
    const slug = 'test';
    const response = await request(baseUrl)
      .post(`${relativeUrl}`)
      .send({
        slug,
        txHash: generateRandomTxHash(),
        url: '/ipfs/kjlfkjsdlkfjdksl',
      })
      .set({ Authorization: getJwt(SAMPLE_DATA.USER_ADDRESS) });

    assert.equal(response.statusCode, 403);
  });

  it('Get 401 for creating campaign when not sending Access token', async () => {
    const slug = 'test';
    const response = await request(baseUrl)
      .post(`${relativeUrl}`)
      .send({
        slug,
        txHash: generateRandomTxHash(),
        url: '/ipfs/dkjalkdjaslkjdas',
      });

    assert.equal(response.statusCode, 401);
  });
}

function PutVerifiedCampaignsTestCases() {
  const generateGivethIoProjectId = () => {
    const now = new Date();
    return `${now.getHours()}${now.getMinutes()}${now.getSeconds()}${now.getMilliseconds()}`;
  };
  it('Change campaign info verified and archived successfully', async () => {
    const givethIoProjectId = generateGivethIoProjectId();
    const title = `test-title-${new Date()}`;
    const campaign = await app.service('campaigns').create({
      ...SAMPLE_DATA.CREATE_CAMPAIGN_DATA,
      status: SAMPLE_DATA.CAMPAIGN_STATUSES.ACTIVE,
      givethIoProjectId,
      verified: false,
    });
    const response = await request(baseUrl)
      .put(`${relativeUrl}`)
      .send({
        campaignId: campaign._id,
        archived: true,
        verified: true,
        title,
      })
      .set({
        Authorization: `Basic ${Buffer.from(
          `${givethIoInfo.username}:${givethIoInfo.password}`,
        ).toString('base64')}`,
      });
    assert.equal(response.body.givethIoProjectId, campaign.givethIoProjectId);
    assert.equal(response.body.title, title);
    assert.isTrue(response.body.verified);
    assert.equal(response.body.status, SAMPLE_DATA.CAMPAIGN_STATUSES.ARCHIVED);
  });
  it('Change campaign info verified true  successfully', async () => {
    const givethIoProjectId = generateGivethIoProjectId();
    const campaign = await app.service('campaigns').create({
      ...SAMPLE_DATA.CREATE_CAMPAIGN_DATA,
      status: SAMPLE_DATA.CAMPAIGN_STATUSES.ACTIVE,
      givethIoProjectId,
      verified: false,
    });
    const response = await request(baseUrl)
      .put(`${relativeUrl}`)
      .send({
        campaignId: campaign._id,
        verified: true,
      })
      .set({
        Authorization: `Basic ${Buffer.from(
          `${givethIoInfo.username}:${givethIoInfo.password}`,
        ).toString('base64')}`,
      });
    assert.equal(response.body.givethIoProjectId, campaign.givethIoProjectId);
    assert.isTrue(response.body.verified);
    assert.equal(response.body.status, SAMPLE_DATA.CAMPAIGN_STATUSES.ACTIVE);
  });
  it('Change campaign info verified false  successfully', async () => {
    const givethIoProjectId = generateGivethIoProjectId();
    const campaign = await app.service('campaigns').create({
      ...SAMPLE_DATA.CREATE_CAMPAIGN_DATA,
      status: SAMPLE_DATA.CAMPAIGN_STATUSES.ACTIVE,
      givethIoProjectId,
      verified: true,
    });
    const response = await request(baseUrl)
      .put(`${relativeUrl}`)
      .send({
        campaignId: campaign._id,
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
    const givethIoProjectId = generateGivethIoProjectId();
    const campaign = await app.service('campaigns').create({
      ...SAMPLE_DATA.CREATE_CAMPAIGN_DATA,
      status: SAMPLE_DATA.CAMPAIGN_STATUSES.ACTIVE,
      givethIoProjectId,
      verified: false,
    });
    const response = await request(baseUrl)
      .put(`${relativeUrl}`)
      .send({
        campaignId: campaign._id,
        archived: true,
      })
      .set({
        Authorization: `Basic ${Buffer.from(
          `${givethIoInfo.username}:${givethIoInfo.password}`,
        ).toString('base64')}`,
      });
    assert.equal(response.body.givethIoProjectId, campaign.givethIoProjectId);
    assert.isFalse(response.body.verified);
    assert.equal(response.body.status, SAMPLE_DATA.CAMPAIGN_STATUSES.ARCHIVED);
  });
  it('Change campaign info archived  false successfully', async () => {
    const givethIoProjectId = generateGivethIoProjectId();
    const campaign = await app.service('campaigns').create({
      ...SAMPLE_DATA.CREATE_CAMPAIGN_DATA,
      status: SAMPLE_DATA.CAMPAIGN_STATUSES.ARCHIVED,
      givethIoProjectId,
      verified: false,
    });
    const response = await request(baseUrl)
      .put(`${relativeUrl}`)
      .send({
        campaignId: campaign._id,
        archived: false,
      })
      .set({
        Authorization: `Basic ${Buffer.from(
          `${givethIoInfo.username}:${givethIoInfo.password}`,
        ).toString('base64')}`,
      });
    assert.equal(response.body.givethIoProjectId, campaign.givethIoProjectId);
    assert.isFalse(response.body.verified);
    assert.equal(response.body.status, SAMPLE_DATA.CAMPAIGN_STATUSES.ACTIVE);
  });

  it('Get 401 when when sending accessToken instead of basicAuthentication', async () => {
    const response = await request(baseUrl)
      .put(`${relativeUrl}`)
      .send({
        campaignId: generateRandomMongoId(),
        verified: false,
      })
      .set({ Authorization: getJwt(SAMPLE_DATA.USER_ADDRESS) });

    assert.equal(response.statusCode, 401);
  });

  it('Get 401 when not sending basicAuthentication', async () => {
    const response = await request(baseUrl)
      .put(`${relativeUrl}`)
      .send({
        campaignId: generateRandomMongoId(),
        verified: true,
      });

    assert.equal(response.statusCode, 401);
  });
}

describe(`Test GET ${relativeUrl}`, GetVerifiedCampaignsTestCases);
describe(`Test POST ${relativeUrl}`, PostVerifiedCampaignsTestCases);
describe(`Test PUT ${relativeUrl}`, PutVerifiedCampaignsTestCases);
