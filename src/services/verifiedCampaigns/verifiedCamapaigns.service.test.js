const request = require('supertest');
const config = require('config');
const { assert } = require('chai');
const { SAMPLE_DATA, getJwt, generateRandomTxHash } = require('../../../test/testUtility');

const baseUrl = config.get('givethFathersBaseUrl');
const relativeUrl = '/verifiedCampaigns';

function GetCreateCampaignForGivethioProjectsTestCases() {
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
function CreateCampaignForGivethioProjectsTestCases() {
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

describe(`Test GET ${relativeUrl}`, GetCreateCampaignForGivethioProjectsTestCases);
describe(`Test POST ${relativeUrl}`, CreateCampaignForGivethioProjectsTestCases);
