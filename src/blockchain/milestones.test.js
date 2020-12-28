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

  async function updateMileStoneByEventData(status) {
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

  it('should update milestone (with Proposed status) by eventData', async () => {
    const upsertedMilestone = await updateMileStoneByEventData(
      SAMPLE_DATA.MILESTONE_STATUSES.PROPOSED,
    );
    assert.equal(upsertedMilestone.status, SAMPLE_DATA.MILESTONE_STATUSES.NEEDS_REVIEW);
    assert.equal(upsertedMilestone.mined, true);
  });

  it('should update milestone (with Failed status) by eventData', async () => {
    const upsertedMilestone = await updateMileStoneByEventData(
      SAMPLE_DATA.MILESTONE_STATUSES.FAILED,
    );
    assert.equal(upsertedMilestone.status, SAMPLE_DATA.MILESTONE_STATUSES.NEEDS_REVIEW);
    assert.equal(upsertedMilestone.mined, true);
  });

  it('should update milestone (with Archived status) by eventData', async () => {
    const upsertedMilestone = await updateMileStoneByEventData(
      SAMPLE_DATA.MILESTONE_STATUSES.ARCHIVED,
    );
    assert.equal(upsertedMilestone.status, SAMPLE_DATA.MILESTONE_STATUSES.NEEDS_REVIEW);
    assert.equal(upsertedMilestone.mined, true);
  });
  it('should update milestone (with Rejected status) by eventData', async () => {
    const upsertedMilestone = await updateMileStoneByEventData(
      SAMPLE_DATA.MILESTONE_STATUSES.REJECTED,
    );
    assert.equal(upsertedMilestone.status, SAMPLE_DATA.MILESTONE_STATUSES.NEEDS_REVIEW);
    assert.equal(upsertedMilestone.mined, true);
  });
  it('should update milestone (with NeedsReview status) by eventData', async () => {
    const upsertedMilestone = await updateMileStoneByEventData(
      SAMPLE_DATA.MILESTONE_STATUSES.NEEDS_REVIEW,
    );
    assert.equal(upsertedMilestone.status, SAMPLE_DATA.MILESTONE_STATUSES.NEEDS_REVIEW);
    assert.equal(upsertedMilestone.mined, true);
  });
  it('should update milestone (with Pending status) by eventData', async () => {
    const upsertedMilestone = await updateMileStoneByEventData(
      SAMPLE_DATA.MILESTONE_STATUSES.PENDING,
    );
    assert.equal(upsertedMilestone.status, SAMPLE_DATA.MILESTONE_STATUSES.NEEDS_REVIEW);
    assert.equal(upsertedMilestone.mined, true);
  });
  it('should not update milestone (with Paying status) by eventData', async () => {
    const upsertedMilestone = await updateMileStoneByEventData(
      SAMPLE_DATA.MILESTONE_STATUSES.PAYING,
    );
    assert.isNotOk(upsertedMilestone);
  });
  it('should not update milestone (with Paid status) by eventData', async () => {
    const upsertedMilestone = await updateMileStoneByEventData(SAMPLE_DATA.MILESTONE_STATUSES.PAID);
    assert.isNotOk(upsertedMilestone);
  });
  it('should not update milestone (with Canceled status) by eventData', async () => {
    const upsertedMilestone = await updateMileStoneByEventData(
      SAMPLE_DATA.MILESTONE_STATUSES.CANCELED,
    );
    assert.isNotOk(upsertedMilestone);
  });
}

describe('reviewRequested() function tests', reviewRequestedTestCases);

before(() => {
  app = getFeatherAppInstance();
  milestoneEventListener = milestoneFactory(app);
});
