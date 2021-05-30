const { assert } = require('chai');
const request = require('supertest');
const config = require('config');
const { getFeatherAppInstance } = require('../app');
const { SAMPLE_DATA, getJwt, generateRandomTxHash } = require('../../test/testUtility');
const {
  findSimilarDelegatedConversation,
  updateConversationPayments,
  findSimilarPayoutConversation,
} = require('./conversationRepository');

const baseUrl = config.get('givethFathersBaseUrl');
const relativeUrl = '/conversations';
let app;

before(() => {
  app = getFeatherAppInstance();
});

function findSimilarPayoutConversationTests() {
  it('should find appropriate delegated conversation', async () => {
    const currencySymbol = 'ETH';
    const txHash = generateRandomTxHash();
    const traceId = SAMPLE_DATA.TRACE_ID;
    const payload = {
      traceId,
      ownerAddress: SAMPLE_DATA.USER_ADDRESS,
      performedByRole: 'Trace owner',
      messageContext: 'payout',
      txHash,
      payments: [
        {
          symbol: currencySymbol,
          decimals: 6,
          amount: '100000000000000000',
        },
      ],
    };
    const response = await request(baseUrl)
      .post(relativeUrl)
      .set({ Authorization: getJwt() })
      .send(payload);
    const payoutConversation = await findSimilarPayoutConversation(app, {
      currencySymbol,
      traceId,
      txHash,
    });
    assert.equal(payoutConversation._id, response.body._id);
  });
  it('should not find appropriate payout conversation because txHash is different', async () => {
    const currencySymbol = 'ETH';
    const txHash = generateRandomTxHash();
    const traceId = SAMPLE_DATA.TRACE_ID;
    const payload = {
      traceId,
      ownerAddress: SAMPLE_DATA.USER_ADDRESS,
      performedByRole: 'Trace owner',
      messageContext: 'payout',
      txHash,
      payments: [
        {
          symbol: currencySymbol,
          decimals: 6,
          amount: '100000000000000000',
        },
      ],
    };
    await request(baseUrl)
      .post(relativeUrl)
      .set({ Authorization: getJwt() })
      .send(payload);
    const payoutConversation = await findSimilarPayoutConversation(app, {
      currencySymbol,
      traceId,
      txHash: generateRandomTxHash(),
    });
    assert.notOk(payoutConversation);
  });
}
function findSimilarDelegatedConversationTests() {
  it('should find appropriate delegated conversation', async () => {
    const currencySymbol = 'ETH';
    const txHash = generateRandomTxHash();
    const traceId = SAMPLE_DATA.TRACE_ID;
    const payload = {
      traceId,
      ownerAddress: SAMPLE_DATA.USER_ADDRESS,
      performedByRole: 'Trace owner',
      messageContext: 'delegated',
      txHash,
      payments: [
        {
          symbol: currencySymbol,
          decimals: 6,
          amount: '100000000000000000',
        },
      ],
    };
    const response = await request(baseUrl)
      .post(relativeUrl)
      .set({ Authorization: getJwt() })
      .send(payload);
    const delegatedConversation = await findSimilarDelegatedConversation(app, {
      currencySymbol,
      traceId,
      txHash,
    });
    assert.equal(delegatedConversation._id, response.body._id);
  });
  it('should not find appropriate delegated conversation because symbol is different', async () => {
    const currencySymbol = 'ETH';
    const txHash = generateRandomTxHash();
    const traceId = SAMPLE_DATA.TRACE_ID;
    const payload = {
      traceId,
      ownerAddress: SAMPLE_DATA.USER_ADDRESS,
      performedByRole: 'Trace owner',
      messageContext: 'delegated',
      txHash,
      payments: [
        {
          symbol: currencySymbol,
          decimals: 6,
          amount: '100000000000000000',
        },
      ],
    };
    await request(baseUrl)
      .post(relativeUrl)
      .set({ Authorization: getJwt() })
      .send(payload);
    const delegatedConversation = await findSimilarDelegatedConversation(app, {
      currencySymbol: 'DAI',
      traceId,
      txHash,
    });
    assert.notOk(delegatedConversation);
  });
  it('should not find appropriate delegated conversation because txHash is different', async () => {
    const currencySymbol = 'ETH';
    const txHash = generateRandomTxHash();
    const traceId = SAMPLE_DATA.TRACE_ID;
    const payload = {
      traceId,
      ownerAddress: SAMPLE_DATA.USER_ADDRESS,
      performedByRole: 'Trace owner',
      messageContext: 'delegated',
      txHash,
      payments: [
        {
          symbol: currencySymbol,
          decimals: 6,
          amount: '100000000000000000',
        },
      ],
    };
    await request(baseUrl)
      .post(relativeUrl)
      .set({ Authorization: getJwt() })
      .send(payload);
    const delegatedConversation = await findSimilarDelegatedConversation(app, {
      currencySymbol,
      traceId,
      txHash: generateRandomTxHash(),
    });
    assert.notOk(delegatedConversation);
  });
}
async function updateConversationPaymentsTests() {
  it('should update existing conversation payments', async () => {
    const currencySymbol = 'ETH';
    const txHash = generateRandomTxHash();
    const traceId = SAMPLE_DATA.TRACE_ID;
    const payload = {
      traceId,
      ownerAddress: SAMPLE_DATA.USER_ADDRESS,
      performedByRole: 'Trace owner',
      messageContext: 'delegated',
      txHash,
      payments: [
        {
          symbol: currencySymbol,
          decimals: 6,
          amount: '100000000000000000',
        },
      ],
    };
    const response = await request(baseUrl)
      .post(relativeUrl)
      .set({ Authorization: getJwt() })
      .send(payload);
    const newPayments = [
      {
        symbol: currencySymbol,
        decimals: 6,
        amount: '200000000000000000',
      },
    ];
    const delegatedConversation = await updateConversationPayments(app, {
      conversationId: response.body._id,
      payments: newPayments,
    });
    assert.equal(delegatedConversation.payments.length, newPayments.length);
    assert.equal(delegatedConversation.payments[0].amount, newPayments[0].amount);
    // expect(delegatedConversation.toObject().payments[0]).to.deep.equal(newPayments[0]);
  });
}

describe(`findSimilarPayoutConversation test cases`, findSimilarPayoutConversationTests);
describe(`findSimilarDelegatedConversation test cases`, findSimilarDelegatedConversationTests);
describe(`updateConversationPayments test cases`, updateConversationPaymentsTests);
