const { assert, expect } = require('chai');
const { createPaymentConversation, getDonationPaymentsByToken } = require('./updateEntityCounters');
const { getFeatherAppInstance } = require('../../app');
const {
  SAMPLE_DATA,
  generateRandomTransactionHash,
  generateRandomEtheriumAddress,
  generateRandomNumber,
} = require('../../../test/testUtility');

let app;

function createPaymentConversationTestCases() {
  it('should create payment conversation successfuly, with one donation', async () => {
    const context = { app, method: 'create' };
    const txHash = generateRandomTransactionHash();
    const amount = '40000000000000';
    const symbol = 'ETH';
    const userAddress = SAMPLE_DATA.USER_ADDRESS;
    const milestone = await app.service('milestones').create({
      ...SAMPLE_DATA.CREATE_MILESTONE_DATA,
      ownerAddress: userAddress,
      recipientAddress: userAddress,
      title: 'Milestone title',
    });
    const donation = await app.service('donations').create({
      status: SAMPLE_DATA.DonationStatus.PAID,
      amount,
      txHash,
      ownerTypeId: milestone._id,
      ownerId: String(generateRandomNumber(10, 1000)),
      pledgeId: String(generateRandomNumber(10, 1000)),
      amountRemaining: amount,
      actionTakerAddress: userAddress,
      giverAddress: userAddress,
      ownerType: 'milestone',
      token: {
        symbol,
        foreignAddress: userAddress,
        decimals: 6,
        name: '"Home Ganache ETH"',
        address: '0x0',
      },
    });
    await createPaymentConversation(context, donation, milestone._id);
    const conversations = (
      await app.service('conversations').find({
        query: {
          txHash,
          messageContext: 'payment',
        },
      })
    ).data;
    assert.ok(conversations);
    assert.equal(conversations.length, 1);
    const payment = conversations[0].payments[0];
    assert.equal(payment.amount, amount);
    assert.equal(payment.symbol, symbol);
  });
  it('should create payment conversation successfuly, with donation', async () => {
    const context = { app, method: 'create' };
    const txHash = generateRandomTransactionHash();
    const amount = '40000000000000';
    const symbol = 'ETH';
    const amount2 = '30000000000000';
    const symbol2 = 'DAI';
    const userAddress = SAMPLE_DATA.USER_ADDRESS;
    const milestone = await app.service('milestones').create({
      ...SAMPLE_DATA.CREATE_MILESTONE_DATA,
      ownerAddress: userAddress,
      recipientAddress: userAddress,
      title: 'Milestone title',
    });
    const donation = await app.service('donations').create({
      status: SAMPLE_DATA.DonationStatus.PAID,
      amount,
      txHash,
      ownerTypeId: milestone._id,
      ownerId: String(generateRandomNumber(10, 1000)),
      pledgeId: String(generateRandomNumber(10, 1000)),
      amountRemaining: amount,
      actionTakerAddress: userAddress,
      giverAddress: userAddress,
      ownerType: 'milestone',
      token: {
        symbol,
        foreignAddress: userAddress,
        decimals: 6,
        name: '"Home Ganache ETH"',
        address: '0x0',
      },
    });
    await app.service('donations').create({
      status: SAMPLE_DATA.DonationStatus.PAID,
      amount: amount2,
      txHash,
      ownerTypeId: milestone._id,
      ownerId: String(generateRandomNumber(10, 1000)),
      pledgeId: String(generateRandomNumber(10, 1000)),
      amountRemaining: amount2,
      actionTakerAddress: userAddress,
      giverAddress: userAddress,
      ownerType: 'milestone',
      token: {
        symbol: symbol2,
        foreignAddress: userAddress,
        decimals: 6,
        name: '"Home Ganache ETH"',
        address: '0x0',
      },
    });
    await createPaymentConversation(context, donation, milestone._id);
    const conversations = (
      await app.service('conversations').find({
        query: {
          txHash,
          messageContext: 'payment',
        },
      })
    ).data;
    assert.ok(conversations);
    assert.equal(conversations.length, 1);
    assert.equal(conversations[0].payments.length, 2);

    // donation2 created after donation1, so in conversation.payments
    // the donation 2 payments comes earlier in array
    const payment2 = conversations[0].payments[1];
    const payment = conversations[0].payments[0];
    assert.equal(payment.amount, amount);
    assert.equal(payment.symbol, symbol);
    assert.equal(payment2.symbol, symbol2);
    assert.equal(payment2.amount, amount2);
  });
  describe('createPaymentConversation() test, should not create conversation', () => {
    async function createMilestoneAndEvent(txHash, eventStatus) {
      const amount = '40000000000000';
      const symbol = 'ETH';
      const userAddress = SAMPLE_DATA.USER_ADDRESS;
      const milestone = await app.service('milestones').create({
        ...SAMPLE_DATA.CREATE_MILESTONE_DATA,
        ownerAddress: userAddress,
        recipientAddress: userAddress,
        title: 'Milestone title',
      });
      await app.service('events').create({
        status: eventStatus,
        event: 'Transfer',
        address: generateRandomEtheriumAddress(),
        transactionHash: txHash,
        logIndex: 1,
        transactionIndex: 1,
        blockNumber: 1,
        id: 1,
        confirmations: 1,
        blockHash: generateRandomTransactionHash(),
      });
      const donation = await app.service('donations').create({
        status: SAMPLE_DATA.DonationStatus.PAID,
        amount,
        txHash,
        ownerTypeId: milestone._id,
        ownerId: String(generateRandomNumber(10, 1000)),
        pledgeId: String(generateRandomNumber(10, 1000)),
        amountRemaining: amount,
        actionTakerAddress: userAddress,
        giverAddress: userAddress,
        ownerType: 'milestone',
        token: {
          symbol,
          foreignAddress: userAddress,
          decimals: 6,
          name: '"Home Ganache ETH"',
          address: '0x0',
        },
      });
      await createPaymentConversation(context, donation, milestone._id);
    }

    it('should not create payment conversation beucase there is Pending transfer event', async () => {
      const txHash = generateRandomTransactionHash();
      await createMilestoneAndEvent(txHash, SAMPLE_DATA.EventStatus.PENDING);
      const conversations = (
        await app.service('conversations').find({
          query: {
            txHash,
            messageContext: 'payment',
          },
        })
      ).data;
      assert.ok(conversations);
      assert.equal(conversations.length, 0);
    });
    it('should not create payment conversation beucase there is Waiting transfer event', async () => {
      const txHash = generateRandomTransactionHash();
      await createMilestoneAndEvent(txHash, SAMPLE_DATA.EventStatus.WAITING);
      const conversations = (
        await app.service('conversations').find({
          query: {
            txHash,
            messageContext: 'payment',
          },
        })
      ).data;
      assert.ok(conversations);
      assert.equal(conversations.length, 0);
    });
    it('should not create payment conversation beucase there is Processing transfer event', async () => {
      const txHash = generateRandomTransactionHash();
      await createMilestoneAndEvent(txHash, SAMPLE_DATA.EventStatus.PROCESSING);
      const conversations = (
        await app.service('conversations').find({
          query: {
            txHash,
            messageContext: 'payment',
          },
        })
      ).data;
      assert.ok(conversations);
      assert.equal(conversations.length, 0);
    });
  });
}

function getDonationPaymentsByTokenTestCases() {
  it('should return correct value for sum of donations with different tokens'
    , () => {
      const donations = [
        {
          amount: '20000000000000',
          token: {
            symbol: 'ETH',
            decimals: '6',
          },
        },
        {
          amount: '70000000000000',
          token: {
            symbol: 'ETH',
            decimals: '6',
          },
        },
        {
          amount: '30000000000000',
          token: {
            symbol: 'ANT',
            decimals: '3',
          },
        },
      ];
      const payments = getDonationPaymentsByToken(donations);
      assert.isOk(payments);
      assert.isArray(payments);
      assert.equal(payments.length, 2);
      expect(payments[0]).to.be.deep.equal({
        amount: '90000000000000',
        symbol: 'ETH',
        decimals: '6',
      });
      expect(payments[1]).to.be.deep.equal({
        amount: '30000000000000',
        symbol: 'ANT',
        decimals: '3',
      });
    });
}

describe('createPaymentConversation() tests', createPaymentConversationTestCases);
describe('getDonationPaymentsByToken() tests', getDonationPaymentsByTokenTestCases);

before(() => {
  app = getFeatherAppInstance();
});
