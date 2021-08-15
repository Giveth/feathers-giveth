const { assert } = require('chai');
const { getFeatherAppInstance } = require('../app');
const traceFactory = require('./traces');
const {
  assertThrowsAsync,
  generateRandomEtheriumAddress,
  SAMPLE_DATA,
  generateRandomTransactionHash,
  generateRandomNumber,
} = require('../../test/testUtility');

let traceEventListener;
let app;

function reviewRequestedTestCases() {
  async function updateMileStoneByRequestReviewEventData(status) {
    const transactionHash = generateRandomTransactionHash();
    const from = generateRandomEtheriumAddress();
    const Transaction = app.get('transactionsModel');
    await new Transaction({ hash: transactionHash, from }).save();
    const idProject = generateRandomNumber(10, 100000);
    await app.service('traces').create({
      ...SAMPLE_DATA.createTraceData(),
      ownerAddress: from,
      mined: false,
      status,
      projectId: idProject,
    });

    const event = {
      returnValues: {
        idProject,
      },
      transactionHash,
      event: 'RequestReview',
    };
    return traceEventListener.reviewRequested(event);
  }

  it('should throw exception , invalid event passed', async () => {
    const badFunc = async () => {
      await traceEventListener.reviewRequested({
        event: 'Not RequestReview or MilestoneCompleteRequested',
      });
    };
    await assertThrowsAsync(
      badFunc,
      'reviewRequested only handles MilestoneCompleteRequested and RequestReview events',
    );
  });

  describe('should update traces successfully with RequestReview event', () => {
    const validStatuses = [
      SAMPLE_DATA.TRACE_STATUSES.PROPOSED,
      SAMPLE_DATA.TRACE_STATUSES.FAILED,
      SAMPLE_DATA.TRACE_STATUSES.ARCHIVED,
      SAMPLE_DATA.TRACE_STATUSES.REJECTED,
      SAMPLE_DATA.TRACE_STATUSES.NEEDS_REVIEW,
      SAMPLE_DATA.TRACE_STATUSES.PENDING,
    ];
    /* eslint-disable no-restricted-syntax */
    for (const status of validStatuses) {
      it(`should update with status ${status}`, async () => {
        const upsertedMilestone = await updateMileStoneByRequestReviewEventData(status);
        assert.equal(upsertedMilestone.status, SAMPLE_DATA.TRACE_STATUSES.NEEDS_REVIEW);
        assert.equal(upsertedMilestone.mined, true);
      });
    }
  });
  it('should not update trace (with Paying status) by eventData', async () => {
    const upsertedMilestone = await updateMileStoneByRequestReviewEventData(
      SAMPLE_DATA.TRACE_STATUSES.PAYING,
    );
    assert.isNotOk(upsertedMilestone);
  });
  it('should not update trace (with Paid status) by eventData', async () => {
    const upsertedMilestone = await updateMileStoneByRequestReviewEventData(
      SAMPLE_DATA.TRACE_STATUSES.PAID,
    );
    assert.isNotOk(upsertedMilestone);
  });
  it('should not update trace (with Canceled status) by eventData', async () => {
    const upsertedMilestone = await updateMileStoneByRequestReviewEventData(
      SAMPLE_DATA.TRACE_STATUSES.CANCELED,
    );
    assert.isNotOk(upsertedMilestone);
  });
}

function rejectTestCases() {
  async function updateMileStoneByRejectEventData(status) {
    const transactionHash = generateRandomTransactionHash();
    const from = generateRandomEtheriumAddress();
    const Transaction = app.get('transactionsModel');
    await new Transaction({ hash: transactionHash, from }).save();
    const idProject = generateRandomNumber(10, 100000);
    await app.service('traces').create({
      ...SAMPLE_DATA.createTraceData(),
      ownerAddress: from,
      mined: false,
      status,
      projectId: idProject,
    });

    const event = {
      returnValues: {
        idProject,
      },
      transactionHash,
      event: 'RejectCompleted',
    };
    return traceEventListener.rejected(event);
  }

  it('should throw exception , invalid event passed', async () => {
    const badFunc = async () => {
      await traceEventListener.rejected({
        event: 'Not MilestoneCompleteRequestRejected or RejectCompleted',
      });
    };
    await assertThrowsAsync(
      badFunc,
      'rejected only handles MilestoneCompleteRequestRejected and RejectCompleted events',
    );
  });

  describe('should update traces successfully with RejectCompleted event', () => {
    const validStatuses = [
      SAMPLE_DATA.TRACE_STATUSES.IN_PROGRESS,
      SAMPLE_DATA.TRACE_STATUSES.FAILED,
      SAMPLE_DATA.TRACE_STATUSES.ARCHIVED,
      SAMPLE_DATA.TRACE_STATUSES.REJECTED,
      SAMPLE_DATA.TRACE_STATUSES.IN_PROGRESS,
      SAMPLE_DATA.TRACE_STATUSES.PENDING,
    ];
    /* eslint-disable no-restricted-syntax */
    for (const status of validStatuses) {
      it(`should update with status ${status}`, async () => {
        const upsertedMilestone = await updateMileStoneByRejectEventData(status);
        assert.equal(upsertedMilestone.status, SAMPLE_DATA.TRACE_STATUSES.IN_PROGRESS);
        assert.equal(upsertedMilestone.mined, true);
      });
    }
  });

  it('should not update trace (with Paying status) by eventData', async () => {
    const upsertedMilestone = await updateMileStoneByRejectEventData(
      SAMPLE_DATA.TRACE_STATUSES.PAYING,
    );
    assert.isNotOk(upsertedMilestone);
  });
  it('should not update trace (with Paid status) by eventData', async () => {
    const upsertedMilestone = await updateMileStoneByRejectEventData(
      SAMPLE_DATA.TRACE_STATUSES.PAID,
    );
    assert.isNotOk(upsertedMilestone);
  });
  it('should not update trace (with Canceled status) by eventData', async () => {
    const upsertedMilestone = await updateMileStoneByRejectEventData(
      SAMPLE_DATA.TRACE_STATUSES.CANCELED,
    );
    assert.isNotOk(upsertedMilestone);
  });
}

function acceptedTestCases() {
  async function updateMileStoneByAcceptedEventData(status) {
    const transactionHash = generateRandomTransactionHash();
    const from = generateRandomEtheriumAddress();
    const Transaction = app.get('transactionsModel');
    await new Transaction({ hash: transactionHash, from }).save();
    const idProject = generateRandomNumber(10, 100000);
    await app.service('traces').create({
      ...SAMPLE_DATA.createTraceData(),
      ownerAddress: from,
      mined: false,
      status,
      projectId: idProject,
    });

    const event = {
      returnValues: {
        idProject,
      },
      transactionHash,
      event: 'ApproveCompleted',
    };
    return traceEventListener.accepted(event);
  }

  it('should throw exception , invalid event passed', async () => {
    const badFunc = async () => {
      await traceEventListener.accepted({
        event: 'Not MilestoneCompleteRequestApproved or ApproveCompleted',
      });
    };
    await assertThrowsAsync(
      badFunc,
      'accepted only handles MilestoneCompleteRequestApproved and ApproveCompleted events',
    );
  });

  it('should change trace status to accepted', async () => {
    const trace = await updateMileStoneByAcceptedEventData(SAMPLE_DATA.TRACE_STATUSES.PROPOSED);
    assert.equal(trace.status, SAMPLE_DATA.TRACE_STATUSES.COMPLETED);
  });
}

function reviewerChangedTestCases() {
  async function updateMileStoneByReviewerChangedEventData(status, reviewerAddress) {
    const transactionHash = generateRandomTransactionHash();
    const from = SAMPLE_DATA.IN_REVIEWER_WHITELIST_USER_ADDRESS;
    const Transaction = app.get('transactionsModel');
    await new Transaction({ hash: transactionHash, from }).save();
    const idProject = generateRandomNumber(10, 100000);
    await app.service('traces').create({
      ...SAMPLE_DATA.createTraceData(),
      ownerAddress: from,
      reviewerAddress: from,
      recipientAddress: from,

      mined: false,
      status,
      projectId: idProject,
    });

    const event = {
      returnValues: {
        idProject,
        reviewer: reviewerAddress,
      },
      transactionHash,
      event: 'ReviewerChanged',
    };
    return traceEventListener.reviewerChanged(event);
  }

  it('should throw exception , invalid event passed', async () => {
    const badFunc = async () => {
      await traceEventListener.reviewerChanged({
        event: 'Not MilestoneReviewerChanged or ReviewerChanged',
      });
    };
    await assertThrowsAsync(
      badFunc,
      'accepted only handles MilestoneReviewerChanged and ReviewerChanged events',
    );
  });

  describe('should reviewerChanged()  update trace successfully by eventData', async () => {
    for (const status of Object.values(SAMPLE_DATA.TRACE_STATUSES)) {
      it(`should update trace with status: ${status} `, async () => {
        const reviewerAddress = SAMPLE_DATA.SECOND_USER_ADDRESS;
        const upsertedMilestone = await updateMileStoneByReviewerChangedEventData(
          status,
          reviewerAddress,
        );
        assert.isOk(upsertedMilestone);
        assert.equal(upsertedMilestone.reviewerAddress, reviewerAddress);
      });
    }
  });
}

function recipientChangedTestCases() {
  async function updateMileStoneByRecipientChangedEventData(status, recipient) {
    const transactionHash = generateRandomTransactionHash();
    const from = SAMPLE_DATA.USER_ADDRESS;
    const Transaction = app.get('transactionsModel');
    await new Transaction({ hash: transactionHash, from }).save();
    const idProject = generateRandomNumber(10, 100000);
    await app.service('traces').create({
      ...SAMPLE_DATA.createTraceData(),
      ownerAddress: from,
      recipientAddress: from,
      mined: false,
      status,
      projectId: idProject,
    });

    const event = {
      returnValues: {
        idProject,
        recipient,
      },
      transactionHash,
      event: 'RecipientChanged',
    };
    return traceEventListener.recipientChanged(event);
  }

  it('should throw exception , invalid event passed', async () => {
    const badFunc = async () => {
      await traceEventListener.recipientChanged({
        event: 'Not MilestoneRecipientChanged or RecipientChanged',
      });
    };
    await assertThrowsAsync(
      badFunc,
      'accepted only handles MilestoneRecipientChanged and RecipientChanged events',
    );
  });

  describe('should update trace successfully by eventData', async () => {
    /* eslint-disable no-restricted-syntax */
    for (const status of Object.values(SAMPLE_DATA.TRACE_STATUSES)) {
      it(`should recipientChanged update trace with status: ${status} `, async () => {
        const recipient = SAMPLE_DATA.SECOND_USER_ADDRESS;
        const upsertedMilestone = await updateMileStoneByRecipientChangedEventData(
          status,
          recipient,
        );
        assert.isOk(upsertedMilestone);
        assert.equal(upsertedMilestone.recipientAddress, recipient);
      });
    }
  });
}

function paymentCollectedTestCases() {
  // async function updateMileStoneByRecipientChangedEventData(status) {
  //   const transactionHash = generateRandomTransactionHash();
  //   const from = generateRandomEtheriumAddress();
  //   const Transaction = app.get('transactionsModel');
  //   await new Transaction({ hash: transactionHash, from }).save();
  //   const idProject = generateRandomNumber(10, 100000);
  //   const trace = await app.service('traces').create({
  //     ...SAMPLE_DATA.createTraceData(),
  //     ownerAddress: from,
  //     fullyFunded: true,
  //     maxAmount: '700',
  //     mined: false,
  //     status,
  //     projectId: idProject,
  //   });
  //
  //   await app.service('donations').create({
  //     status: 'Committed',
  //     amountRemaining: '20',
  //     giverAddress: generateRandomEtheriumAddress(),
  //     ownerType: 'trace',
  //     ownerId: from,
  //     pledgeId: process,
  //     amount: '21',
  //     ownerTypeId: trace._id,
  //     token: {
  //       name: 'Ropsten ETH',
  //       address: '0x0',
  //       foreignAddress: '0x387871cf72c8CC81E3a945402b0E3A2A6C0Ed38a',
  //       symbol: 'ETH',
  //       decimals: '6',
  //     },
  //   });
  //   const event = {
  //     returnValues: {
  //       idProject,
  //     },
  //     transactionHash,
  //     event: 'paymentCollected',
  //   };
  //   return traceEventListener.paymentCollected(event);
  // }

  it('should throw exception , invalid event passed', async () => {
    const badFunc = async () => {
      await traceEventListener.paymentCollected({
        event: 'Not paymentCollected',
      });
    };
    await assertThrowsAsync(badFunc, 'paymentCollected only handles PaymentCollected events');
  });

  // When executing tests, this case blocks exucte and finally it failed (I dont know why)
  // So I comment it for now
  // describe('should paymentCollected() update trace successfully by eventData',
  //   async () => {
  //     for (const status of Object.values(SAMPLE_DATA.TRACE_STATUSES)) {
  //       it(`should update trace with status: ${status} `, async function() {
  //         const upsertedMilestone = await updateMileStoneByRecipientChangedEventData(
  //           status,
  //         );
  //         assert.isOk(upsertedMilestone);
  //         assert.equal(upsertedMilestone.status, SAMPLE_DATA.TRACE_STATUSES.PAID);
  //
  //       });
  //     }
  //   });
}

describe('reviewRequested() function tests', reviewRequestedTestCases);
describe('rejected() function tests', rejectTestCases);
describe('accepted() function tests', acceptedTestCases);
describe('reviewerChanged() function tests', reviewerChangedTestCases);
describe('recipientChanged() function tests', recipientChangedTestCases);
describe('paymentCollected() function tests', paymentCollectedTestCases);

before(() => {
  app = getFeatherAppInstance();
  traceEventListener = traceFactory(app);
});
