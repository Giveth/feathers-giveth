const { assert } = require('chai');
const { getFeatherAppInstance } = require('../app');
const milestoneFactory = require('./milestones');
const {
  assertThrowsAsync,
  generateRandomEtheriumAddress,
  SAMPLE_DATA,
  generateRandomTransactionHash,
  generateRandomNumber,
} = require('../../test/testUtility');

let milestoneEventListener;
let app;

function reviewRequestedTestCases() {
  async function updateMileStoneByRequestReviewEventData(status) {
    const transactionHash = generateRandomTransactionHash();
    const from = generateRandomEtheriumAddress();
    const Transaction = app.get('transactionsModel');
    await new Transaction({ hash: transactionHash, from }).save();
    const idProject = generateRandomNumber(10, 100000);
    await app.service('milestones').create({
      ...SAMPLE_DATA.CREATE_MILESTONE_DATA,
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
    return milestoneEventListener.reviewRequested(event);
  }

  it('should throw exception , invalid event passed', async () => {
    const badFunc = async () => {
      await milestoneEventListener.reviewRequested({
        event: 'Not RequestReview or MilestoneCompleteRequested',
      });
    };
    await assertThrowsAsync(
      badFunc,
      'reviewRequested only handles MilestoneCompleteRequested and RequestReview events',
    );
  });

  it('should update milestone (with Proposed status) by eventData', async () => {
    const upsertedMilestone = await updateMileStoneByRequestReviewEventData(
      SAMPLE_DATA.MILESTONE_STATUSES.PROPOSED,
    );
    assert.equal(upsertedMilestone.status, SAMPLE_DATA.MILESTONE_STATUSES.NEEDS_REVIEW);
    assert.equal(upsertedMilestone.mined, true);
  });

  it('should update milestone (with Failed status) by eventData', async () => {
    const upsertedMilestone = await updateMileStoneByRequestReviewEventData(
      SAMPLE_DATA.MILESTONE_STATUSES.FAILED,
    );
    assert.equal(upsertedMilestone.status, SAMPLE_DATA.MILESTONE_STATUSES.NEEDS_REVIEW);
    assert.equal(upsertedMilestone.mined, true);
  });

  it('should update milestone (with Archived status) by eventData', async () => {
    const upsertedMilestone = await updateMileStoneByRequestReviewEventData(
      SAMPLE_DATA.MILESTONE_STATUSES.ARCHIVED,
    );
    assert.equal(upsertedMilestone.status, SAMPLE_DATA.MILESTONE_STATUSES.NEEDS_REVIEW);
    assert.equal(upsertedMilestone.mined, true);
  });
  it('should update milestone (with Rejected status) by eventData', async () => {
    const upsertedMilestone = await updateMileStoneByRequestReviewEventData(
      SAMPLE_DATA.MILESTONE_STATUSES.REJECTED,
    );
    assert.equal(upsertedMilestone.status, SAMPLE_DATA.MILESTONE_STATUSES.NEEDS_REVIEW);
    assert.equal(upsertedMilestone.mined, true);
  });
  it('should update milestone (with NeedsReview status) by eventData', async () => {
    const upsertedMilestone = await updateMileStoneByRequestReviewEventData(
      SAMPLE_DATA.MILESTONE_STATUSES.NEEDS_REVIEW,
    );
    assert.equal(upsertedMilestone.status, SAMPLE_DATA.MILESTONE_STATUSES.NEEDS_REVIEW);
    assert.equal(upsertedMilestone.mined, true);
  });
  it('should update milestone (with Pending status) by eventData', async () => {
    const upsertedMilestone = await updateMileStoneByRequestReviewEventData(
      SAMPLE_DATA.MILESTONE_STATUSES.PENDING,
    );
    assert.equal(upsertedMilestone.status, SAMPLE_DATA.MILESTONE_STATUSES.NEEDS_REVIEW);
    assert.equal(upsertedMilestone.mined, true);
  });
  it('should not update milestone (with Paying status) by eventData', async () => {
    const upsertedMilestone = await updateMileStoneByRequestReviewEventData(
      SAMPLE_DATA.MILESTONE_STATUSES.PAYING,
    );
    assert.isNotOk(upsertedMilestone);
  });
  it('should not update milestone (with Paid status) by eventData', async () => {
    const upsertedMilestone = await updateMileStoneByRequestReviewEventData(SAMPLE_DATA.MILESTONE_STATUSES.PAID);
    assert.isNotOk(upsertedMilestone);
  });
  it('should not update milestone (with Canceled status) by eventData', async () => {
    const upsertedMilestone = await updateMileStoneByRequestReviewEventData(
      SAMPLE_DATA.MILESTONE_STATUSES.CANCELED,
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
    await app.service('milestones').create({
      ...SAMPLE_DATA.CREATE_MILESTONE_DATA,
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
    return milestoneEventListener.rejected(event);
  }

  it('should throw exception , invalid event passed', async () => {
    const badFunc = async () => {
      await milestoneEventListener.rejected({
        event: 'Not MilestoneCompleteRequestRejected or RejectCompleted',
      });
    };
    await assertThrowsAsync(
      badFunc,
      'rejected only handles MilestoneCompleteRequestRejected and RejectCompleted events',
    );
  });

  it('should update milestone (with Proposed status) by eventData',
    async () => {
    const upsertedMilestone = await updateMileStoneByRejectEventData(
      SAMPLE_DATA.MILESTONE_STATUSES.PROPOSED,
    );
    assert.equal(upsertedMilestone.status, SAMPLE_DATA.MILESTONE_STATUSES.IN_PROGRESS);
    assert.equal(upsertedMilestone.mined, true);
  });

  it('should update milestone (with Failed status) by eventData',
    async () => {
    const upsertedMilestone = await updateMileStoneByRejectEventData(
      SAMPLE_DATA.MILESTONE_STATUSES.FAILED,
    );
    assert.equal(upsertedMilestone.status, SAMPLE_DATA.MILESTONE_STATUSES.IN_PROGRESS);
    assert.equal(upsertedMilestone.mined, true);
  });

  it('should update milestone (with Archived status) by eventData',
    async () => {
    const upsertedMilestone = await updateMileStoneByRejectEventData(
      SAMPLE_DATA.MILESTONE_STATUSES.ARCHIVED,
    );
    assert.equal(upsertedMilestone.status, SAMPLE_DATA.MILESTONE_STATUSES.IN_PROGRESS);
    assert.equal(upsertedMilestone.mined, true);
  });
  it('should update milestone (with Rejected status) by eventData',
    async () => {
    const upsertedMilestone = await updateMileStoneByRejectEventData(
      SAMPLE_DATA.MILESTONE_STATUSES.REJECTED,
    );
    assert.equal(upsertedMilestone.status, SAMPLE_DATA.MILESTONE_STATUSES.IN_PROGRESS);
    assert.equal(upsertedMilestone.mined, true);
  });
  it('should update milestone (with NeedsReview status) by eventData',
    async () => {
    const upsertedMilestone = await updateMileStoneByRejectEventData(
      SAMPLE_DATA.MILESTONE_STATUSES.IN_PROGRESS,
    );
    assert.equal(upsertedMilestone.status, SAMPLE_DATA.MILESTONE_STATUSES.IN_PROGRESS);
    assert.equal(upsertedMilestone.mined, true);
  });
  it('should update milestone (with Pending status) by eventData',
    async () => {
    const upsertedMilestone = await updateMileStoneByRejectEventData(
      SAMPLE_DATA.MILESTONE_STATUSES.PENDING,
    );
    assert.equal(upsertedMilestone.status, SAMPLE_DATA.MILESTONE_STATUSES.IN_PROGRESS);
    assert.equal(upsertedMilestone.mined, true);
  });
  it('should not update milestone (with Paying status) by eventData',
    async () => {
    const upsertedMilestone = await updateMileStoneByRejectEventData(
      SAMPLE_DATA.MILESTONE_STATUSES.PAYING,
    );
    assert.isNotOk(upsertedMilestone);
  });
  it('should not update milestone (with Paid status) by eventData',
    async () => {
    const upsertedMilestone = await updateMileStoneByRejectEventData(SAMPLE_DATA.MILESTONE_STATUSES.PAID);
    assert.isNotOk(upsertedMilestone);
  });
  it('should not update milestone (with Canceled status) by eventData',
    async () => {
    const upsertedMilestone = await updateMileStoneByRejectEventData(
      SAMPLE_DATA.MILESTONE_STATUSES.CANCELED,
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
    await app.service('milestones').create({
      ...SAMPLE_DATA.CREATE_MILESTONE_DATA,
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
    return milestoneEventListener.accepted(event);
  }

  it('should throw exception , invalid event passed', async () => {
    const badFunc = async () => {
      await milestoneEventListener.accepted({
        event: 'Not MilestoneCompleteRequestApproved or ApproveCompleted',
      });
    };
    await assertThrowsAsync(
      badFunc,
      'accepted only handles MilestoneCompleteRequestApproved and ApproveCompleted events',
    );
  });

  it('should update milestone (with Proposed status) by eventData',
    async () => {
    const upsertedMilestone = await updateMileStoneByAcceptedEventData(
      SAMPLE_DATA.MILESTONE_STATUSES.PROPOSED,
    );
    assert.equal(upsertedMilestone.status, SAMPLE_DATA.MILESTONE_STATUSES.COMPLETED);
    assert.equal(upsertedMilestone.mined, true);
  });

  it('should update milestone (with Failed status) by eventData',
    async () => {
    const upsertedMilestone = await updateMileStoneByAcceptedEventData(
      SAMPLE_DATA.MILESTONE_STATUSES.FAILED,
    );
    assert.equal(upsertedMilestone.status, SAMPLE_DATA.MILESTONE_STATUSES.COMPLETED);
    assert.equal(upsertedMilestone.mined, true);
  });

  it('should update milestone (with Archived status) by eventData',
    async () => {
    const upsertedMilestone = await updateMileStoneByAcceptedEventData(
      SAMPLE_DATA.MILESTONE_STATUSES.ARCHIVED,
    );
    assert.equal(upsertedMilestone.status, SAMPLE_DATA.MILESTONE_STATUSES.COMPLETED);
    assert.equal(upsertedMilestone.mined, true);
  });
  it('should update milestone (with Rejected status) by eventData',
    async () => {
    const upsertedMilestone = await updateMileStoneByAcceptedEventData(
      SAMPLE_DATA.MILESTONE_STATUSES.REJECTED,
    );
    assert.equal(upsertedMilestone.status, SAMPLE_DATA.MILESTONE_STATUSES.COMPLETED);
    assert.equal(upsertedMilestone.mined, true);
  });
  it('should update milestone (with NeedsReview status) by eventData',
    async () => {
    const upsertedMilestone = await updateMileStoneByAcceptedEventData(
      SAMPLE_DATA.MILESTONE_STATUSES.COMPLETED,
    );
    assert.equal(upsertedMilestone.status, SAMPLE_DATA.MILESTONE_STATUSES.COMPLETED);
    assert.equal(upsertedMilestone.mined, true);
  });
  it('should update milestone (with Pending status) by eventData',
    async () => {
    const upsertedMilestone = await updateMileStoneByAcceptedEventData(
      SAMPLE_DATA.MILESTONE_STATUSES.PENDING,
    );
    assert.equal(upsertedMilestone.status, SAMPLE_DATA.MILESTONE_STATUSES.COMPLETED);
    assert.equal(upsertedMilestone.mined, true);
  });
  it('should not update milestone (with Paying status) by eventData',
    async () => {
    const upsertedMilestone = await updateMileStoneByAcceptedEventData(
      SAMPLE_DATA.MILESTONE_STATUSES.PAYING,
    );
    assert.isNotOk(upsertedMilestone);
  });
  it('should not update milestone (with Paid status) by eventData',
    async () => {
    const upsertedMilestone = await updateMileStoneByAcceptedEventData(SAMPLE_DATA.MILESTONE_STATUSES.PAID);
    assert.isNotOk(upsertedMilestone);
  });
  it('should not update milestone (with Canceled status) by eventData',
    async () => {
    const upsertedMilestone = await updateMileStoneByAcceptedEventData(
      SAMPLE_DATA.MILESTONE_STATUSES.CANCELED,
    );
    assert.isNotOk(upsertedMilestone);
  });
}

describe('reviewRequested() function tests', reviewRequestedTestCases);
describe('rejected() function tests', rejectTestCases);
describe('accepted() function tests', acceptedTestCases);

before(() => {
  app = getFeatherAppInstance();
  milestoneEventListener = milestoneFactory(app);
});
