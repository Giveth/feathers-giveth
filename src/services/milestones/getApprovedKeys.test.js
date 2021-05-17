const { assert, expect } = require('chai');
const getApprovedKeys = require('./getApprovedKeys');
const { SAMPLE_DATA } = require('../../../test/testUtility');

function getApprovedKeysTestCases() {
  const mileStone = {
    recipientAddress: SAMPLE_DATA.USER_ADDRESS,
    ownerAddress: SAMPLE_DATA.USER_ADDRESS,
    campaign: {
      ownerAddress: SAMPLE_DATA.USER_ADDRESS,
      coownerAddress: SAMPLE_DATA.USER_ADDRESS,
    },
  };
  const mileStoneOwnerUser = {
    address: SAMPLE_DATA.USER_ADDRESS,
  };
  it('should return just pendingRecipientAddress if data included pendingRecipientAddress', function() {
    const approvedKeys = getApprovedKeys(
      mileStone,
      { pendingRecipientAddress: 'test' },
      mileStoneOwnerUser,
    );

    assert.equal(approvedKeys.length, 1);
    assert.equal(approvedKeys[0], 'pendingRecipientAddress');
  });

  it('should throw exception because user is not milestone recipient', function() {
    const badFunc = () => {
      getApprovedKeys(
        mileStone,
        { pendingRecipientAddress: 'test' },
        {
          address: SAMPLE_DATA.SECOND_USER_ADDRESS,
        },
      );
    };
    assert.throw(badFunc, 'Only the Milestone recipient can change the recipient');
  });

  it('should throw exception because milestone has no recipientAddress and user is not milestone owner', function() {
    const badFunc = () => {
      getApprovedKeys(
        {
          ownerAddress: SAMPLE_DATA.USER_ADDRESS,
        },
        { pendingRecipientAddress: 'test' },
        {
          address: SAMPLE_DATA.SECOND_USER_ADDRESS,
        },
      );
    };
    assert.throw(badFunc, 'Only the Milestone Manager can set the recipient');
  });

  it('should throw exception because user is not milestone recipient', function() {
    const badFunc = () => {
      getApprovedKeys(
        mileStone,
        { pendingRecipientAddress: 'test' },
        {
          address: SAMPLE_DATA.SECOND_USER_ADDRESS,
        },
      );
    };

    assert.throw(badFunc, 'Only the Milestone recipient can change the recipient');
  });

  it('should throw exception, Only the Campaign Manager can accept a milestone', function() {
    const badFunc = () => {
      getApprovedKeys(
        { ...mileStone, status: SAMPLE_DATA.MILESTONE_STATUSES.PROPOSED },
        { status: SAMPLE_DATA.MILESTONE_STATUSES.PENDING },
        {
          address: SAMPLE_DATA.SECOND_USER_ADDRESS,
        },
      );
    };

    assert.throw(badFunc, 'Only the Campaign Manager can accept a milestone');
  });

  it('should return an array, campaignManager wants to accept milestone', function() {
    const expectedKeys = ['txHash', 'status', 'mined', 'ownerAddress', 'message', 'proofItems'];
    const approvedKeys = getApprovedKeys(
      { ...mileStone, status: SAMPLE_DATA.MILESTONE_STATUSES.PROPOSED },
      { status: SAMPLE_DATA.MILESTONE_STATUSES.PENDING },
      mileStoneOwnerUser,
    );

    expect(approvedKeys.sort()).to.deep.equal(expectedKeys.sort());
  });

  it('should throw exception, Only the Campaign Manager can reject a milestone', function() {
    const badFunc = () => {
      getApprovedKeys(
        { ...mileStone, status: SAMPLE_DATA.MILESTONE_STATUSES.PROPOSED },
        { status: SAMPLE_DATA.MILESTONE_STATUSES.REJECTED },
        {
          address: SAMPLE_DATA.SECOND_USER_ADDRESS,
        },
      );
    };

    assert.throw(badFunc, 'Only the Campaign Manager can reject a milestone');
  });

  it('should return an array, campaignManager wants to reject milestone', function() {
    const expectedKeys = ['status', 'message', 'proofItems'];
    const approvedKeys = getApprovedKeys(
      { ...mileStone, status: SAMPLE_DATA.MILESTONE_STATUSES.PROPOSED },
      { status: SAMPLE_DATA.MILESTONE_STATUSES.REJECTED },
      mileStoneOwnerUser,
    );

    expect(approvedKeys.sort()).to.deep.equal(expectedKeys.sort());
  });

  it('should throw exception, Only the Milestone Manager or Recipient can mark a milestone complete', function() {
    const badFunc = () => {
      getApprovedKeys(
        { ...mileStone, status: SAMPLE_DATA.MILESTONE_STATUSES.IN_PROGRESS },
        { status: SAMPLE_DATA.MILESTONE_STATUSES.NEEDS_REVIEW },
        {
          address: SAMPLE_DATA.SECOND_USER_ADDRESS,
        },
      );
    };

    assert.throw(badFunc, 'Only the Milestone Manager or Recipient can mark a milestone complete');
  });

  it('should return an array, milestone manager wants to mark a milestone complete', function() {
    const expectedKeys = ['description', 'txHash', 'status', 'mined', 'message', 'proofItems'];
    const approvedKeys = getApprovedKeys(
      { ...mileStone, status: SAMPLE_DATA.MILESTONE_STATUSES.IN_PROGRESS },
      { status: SAMPLE_DATA.MILESTONE_STATUSES.NEEDS_REVIEW },
      mileStoneOwnerUser,
    );

    expect(approvedKeys.sort()).to.deep.equal(expectedKeys.sort());
  });

  it('should throw exception, Only the Milestone Manager or Campaign Manager can archive a milestone', function() {
    const badFunc = () => {
      getApprovedKeys(
        { ...mileStone, status: SAMPLE_DATA.MILESTONE_STATUSES.IN_PROGRESS },
        { status: SAMPLE_DATA.MILESTONE_STATUSES.ARCHIVED },
        {
          address: SAMPLE_DATA.SECOND_USER_ADDRESS,
        },
      );
    };

    assert.throw(badFunc, 'Only the Milestone Manager or Campaign Manager can archive a milestone');
  });

  it('should return an array, milestone manager wants to archive a milestone', function() {
    const expectedKeys = ['txHash', 'status', 'mined'];
    const approvedKeys = getApprovedKeys(
      { ...mileStone, status: SAMPLE_DATA.MILESTONE_STATUSES.IN_PROGRESS },
      { status: SAMPLE_DATA.MILESTONE_STATUSES.ARCHIVED },
      mileStoneOwnerUser,
    );

    expect(approvedKeys.sort()).to.deep.equal(expectedKeys.sort());
  });

  it('should throw exception, Only the Milestone Manager or Milestone Reviewer can cancel a milestone', function() {
    const badFunc = () => {
      getApprovedKeys(
        { ...mileStone, status: SAMPLE_DATA.MILESTONE_STATUSES.IN_PROGRESS },
        {
          status: SAMPLE_DATA.MILESTONE_STATUSES.CANCELED,
          mined: false,
        },
        {
          address: SAMPLE_DATA.SECOND_USER_ADDRESS,
        },
      );
    };

    assert.throw(
      badFunc,
      'Only the Milestone Manager or Milestone Reviewer can cancel a milestone',
    );
  });

  it('should return an array, milestone manager wants to cancel a milestone', function() {
    const expectedKeys = ['txHash', 'status', 'mined', 'prevStatus', 'message', 'proofItems'];
    const approvedKeys = getApprovedKeys(
      { ...mileStone, status: SAMPLE_DATA.MILESTONE_STATUSES.IN_PROGRESS },
      {
        status: SAMPLE_DATA.MILESTONE_STATUSES.CANCELED,
        mined: false,
      },
      mileStoneOwnerUser,
    );

    expect(approvedKeys.sort()).to.deep.equal(expectedKeys.sort());
  });

  it('should throw exception, Only the Milestone and Campaign Manager can edit mileston', function() {
    const badFunc = () => {
      getApprovedKeys(
        { ...mileStone, status: SAMPLE_DATA.MILESTONE_STATUSES.IN_PROGRESS },
        {
          status: SAMPLE_DATA.MILESTONE_STATUSES.IN_PROGRESS,
        },
        {
          address: SAMPLE_DATA.SECOND_USER_ADDRESS,
        },
      );
    };

    assert.throw(badFunc, 'Only the Milestone and Campaign Manager can edit milestone');
  });

  it('should return an array, milestone manager wants to edit a milestone', function() {
    const expectedKeys = ['title', 'description', 'image', 'message', 'proofItems', 'mined'];
    const approvedKeys = getApprovedKeys(
      { ...mileStone, status: SAMPLE_DATA.MILESTONE_STATUSES.IN_PROGRESS },
      {
        status: SAMPLE_DATA.MILESTONE_STATUSES.IN_PROGRESS,
        mined: false,
      },
      mileStoneOwnerUser,
    );

    expect(approvedKeys.sort()).to.deep.equal(expectedKeys.sort());
  });

  it('should throw exception, Only the Milestone and Campaign Manager can edit proposed milestone', function() {
    const badFunc = () => {
      getApprovedKeys(
        { ...mileStone, status: SAMPLE_DATA.MILESTONE_STATUSES.IN_PROGRESS },
        {
          status: SAMPLE_DATA.MILESTONE_STATUSES.PROPOSED,
        },
        {
          address: SAMPLE_DATA.SECOND_USER_ADDRESS,
        },
      );
    };

    assert.throw(badFunc, 'Only the Milestone and Campaign Manager can edit proposed milestone');
  });

  it('should return an array, milestone manager wants to edit a proposed milestone', function() {
    const expectedKeys = [
      'title',
      'description',
      'maxAmount',
      'reviewerAddress',
      'recipientAddress',
      'recipientId',
      'conversionRateTimestamp',
      'selectedFiatType',
      'date',
      'fiatAmount',
      'conversionRate',
      'items',
      'message',
      'proofItems',
      'image',
      'token',
      'type',
      'dacId',
    ];
    const approvedKeys = getApprovedKeys(
      { ...mileStone, status: SAMPLE_DATA.MILESTONE_STATUSES.IN_PROGRESS },
      {
        status: SAMPLE_DATA.MILESTONE_STATUSES.PROPOSED,
        mined: false,
      },
      mileStoneOwnerUser,
    );

    expect(approvedKeys.sort()).to.deep.equal(expectedKeys.sort());
  });

  it('should return an empty array, data.status doesnt match to any if statement in InProgress case', function() {
    const statusShouldReturnEmptyArrray = [
      SAMPLE_DATA.MILESTONE_STATUSES.COMPLETED,
      SAMPLE_DATA.MILESTONE_STATUSES.PENDING,
      SAMPLE_DATA.MILESTONE_STATUSES.PAYING,
      SAMPLE_DATA.MILESTONE_STATUSES.PAID,
      SAMPLE_DATA.MILESTONE_STATUSES.FAILED,
      SAMPLE_DATA.MILESTONE_STATUSES.REJECTED,
    ];
    /* eslint-disable no-restricted-syntax  */
    for (const status of statusShouldReturnEmptyArrray) {
      const approvedKeys = getApprovedKeys(
        { ...mileStone, status: SAMPLE_DATA.MILESTONE_STATUSES.IN_PROGRESS },
        {
          status,
          mined: false,
        },
        mileStoneOwnerUser,
      );
      assert.isArray(approvedKeys);
      assert.equal(approvedKeys.length, 0);
    }
  });

  it('should throw exception, Only the Milestone or Campaign Reviewer can approve milestone has been completed', function() {
    const badFunc = () => {
      getApprovedKeys(
        {
          ...mileStone,
          reviewerAddress: SAMPLE_DATA.USER_ADDRESS,
          campaignReviewerAddress: SAMPLE_DATA.USER_ADDRESS,
          status: SAMPLE_DATA.MILESTONE_STATUSES.NEEDS_REVIEW,
        },
        {
          status: SAMPLE_DATA.MILESTONE_STATUSES.COMPLETED,
          mined: false,
        },
        {
          address: SAMPLE_DATA.SECOND_USER_ADDRESS,
        },
      );
    };

    assert.throw(
      badFunc,
      'Only the Milestone or Campaign Reviewer can approve milestone has been completed',
    );
  });

  it('should return an array, Campaign Reviewer wants to approve milestone has been completed', function() {
    const expectedKeys = ['txHash', 'status', 'mined', 'prevStatus', 'message', 'proofItems'];
    const approvedKeys = getApprovedKeys(
      {
        ...mileStone,
        reviewerAddress: SAMPLE_DATA.USER_ADDRESS,
        status: SAMPLE_DATA.MILESTONE_STATUSES.NEEDS_REVIEW,
      },
      {
        status: SAMPLE_DATA.MILESTONE_STATUSES.COMPLETED,
        mined: false,
      },
      mileStoneOwnerUser,
    );

    expect(approvedKeys.sort()).to.deep.equal(expectedKeys.sort());
  });

  it('should throw exception, Only the Milestone or Campaign Reviewer can reject that milestone has been completed', function() {
    const badFunc = () => {
      getApprovedKeys(
        {
          ...mileStone,
          reviewerAddress: SAMPLE_DATA.USER_ADDRESS,
          campaignReviewerAddress: SAMPLE_DATA.USER_ADDRESS,
          status: SAMPLE_DATA.MILESTONE_STATUSES.NEEDS_REVIEW,
        },
        {
          status: SAMPLE_DATA.MILESTONE_STATUSES.IN_PROGRESS,
        },
        {
          address: SAMPLE_DATA.SECOND_USER_ADDRESS,
        },
      );
    };

    assert.throw(
      badFunc,
      'Only the Milestone or Campaign Reviewer can reject that milestone has been completed',
    );
  });

  it('should return an array,Milestone or Campaign Reviewer want to reject that milestone has been completed', function() {
    const expectedKeys = ['status', 'mined', 'message', 'proofItems'];
    const approvedKeys = getApprovedKeys(
      {
        ...mileStone,
        reviewerAddress: SAMPLE_DATA.USER_ADDRESS,
        status: SAMPLE_DATA.MILESTONE_STATUSES.NEEDS_REVIEW,
      },
      {
        status: SAMPLE_DATA.MILESTONE_STATUSES.IN_PROGRESS,
      },
      mileStoneOwnerUser,
    );
    expect(approvedKeys.sort()).to.deep.equal(expectedKeys.sort());
  });

  it("should throw exception, Only the Milestone Manager or Milestone Reviewer can cancel a milestone'", function() {
    const badFunc = () => {
      getApprovedKeys(
        {
          ...mileStone,
          reviewerAddress: SAMPLE_DATA.USER_ADDRESS,
          campaignReviewerAddress: SAMPLE_DATA.USER_ADDRESS,
          status: SAMPLE_DATA.MILESTONE_STATUSES.NEEDS_REVIEW,
        },
        {
          status: SAMPLE_DATA.MILESTONE_STATUSES.CANCELED,
          mined: false,
        },
        {
          address: SAMPLE_DATA.SECOND_USER_ADDRESS,
        },
      );
    };

    assert.throw(
      badFunc,
      'Only the Milestone Manager or Milestone Reviewer can cancel a milestone',
    );
  });

  it('should return an array, Milestone Manager or Milestone Reviewer want to cancel a milestone', function() {
    const expectedKeys = ['txHash', 'status', 'mined', 'prevStatus', 'message', 'proofItems'];
    const approvedKeys = getApprovedKeys(
      {
        ...mileStone,
        reviewerAddress: SAMPLE_DATA.USER_ADDRESS,
        status: SAMPLE_DATA.MILESTONE_STATUSES.NEEDS_REVIEW,
      },
      {
        status: SAMPLE_DATA.MILESTONE_STATUSES.CANCELED,
        mined: false,
      },
      mileStoneOwnerUser,
    );

    expect(approvedKeys.sort()).to.deep.equal(expectedKeys.sort());
  });

  it('should throw exception, Only the Milestone and Campaign Manager can edit milestone', function() {
    const badFunc = () => {
      getApprovedKeys(
        {
          ...mileStone,
          reviewerAddress: SAMPLE_DATA.USER_ADDRESS,
          campaignReviewerAddress: SAMPLE_DATA.USER_ADDRESS,
          status: SAMPLE_DATA.MILESTONE_STATUSES.NEEDS_REVIEW,
        },
        {
          status: SAMPLE_DATA.MILESTONE_STATUSES.NEEDS_REVIEW,
        },
        {
          address: SAMPLE_DATA.SECOND_USER_ADDRESS,
        },
      );
    };

    assert.throw(badFunc, 'Only the Milestone and Campaign Manager can edit milestone');
  });

  it('should return an array, Milestone Manager or Campaign Manager want to edit a milestone', function() {
    const expectedKeys = ['title', 'description', 'image', 'message', 'proofItems', 'mined'];
    const approvedKeys = getApprovedKeys(
      {
        ...mileStone,
        reviewerAddress: SAMPLE_DATA.USER_ADDRESS,
        status: SAMPLE_DATA.MILESTONE_STATUSES.NEEDS_REVIEW,
      },
      {
        status: SAMPLE_DATA.MILESTONE_STATUSES.NEEDS_REVIEW,
        mined: false,
      },
      mileStoneOwnerUser,
    );

    expect(approvedKeys.sort()).to.deep.equal(expectedKeys.sort());
  });

  it('should return an empty array, data.status doesnt match to any if statement in NeedsReview case', function() {
    const statusShouldReturnEmptyArrray = [
      SAMPLE_DATA.MILESTONE_STATUSES.PENDING,
      SAMPLE_DATA.MILESTONE_STATUSES.PAYING,
      SAMPLE_DATA.MILESTONE_STATUSES.PAID,
      SAMPLE_DATA.MILESTONE_STATUSES.FAILED,
      SAMPLE_DATA.MILESTONE_STATUSES.REJECTED,
      SAMPLE_DATA.MILESTONE_STATUSES.PROPOSED,
      SAMPLE_DATA.MILESTONE_STATUSES.ARCHIVED,
    ];

    for (const status of statusShouldReturnEmptyArrray) {
      const approvedKeys = getApprovedKeys(
        {
          ...mileStone,
          reviewerAddress: SAMPLE_DATA.USER_ADDRESS,
          status: SAMPLE_DATA.MILESTONE_STATUSES.NEEDS_REVIEW,
        },
        {
          status,
          mined: false,
        },
        mileStoneOwnerUser,
      );
      assert.isArray(approvedKeys);
      assert.equal(approvedKeys.length, 0);
    }
  });

  it('should throw exception, Only the Milestone Manager or Recipient can disburse a milestone payment', function() {
    const badFunc = () => {
      getApprovedKeys(
        {
          ...mileStone,
          reviewerAddress: SAMPLE_DATA.USER_ADDRESS,
          campaignReviewerAddress: SAMPLE_DATA.USER_ADDRESS,
          status: SAMPLE_DATA.MILESTONE_STATUSES.COMPLETED,
        },
        {
          status: SAMPLE_DATA.MILESTONE_STATUSES.PAYING,
        },
        {
          address: SAMPLE_DATA.SECOND_USER_ADDRESS,
        },
      );
    };

    assert.throw(
      badFunc,
      'Only the Milestone Manager or Recipient can disburse a milestone payment',
    );
  });

  it('should return an array, Milestone Manager or Recipient can disburse a milestone payment', function() {
    const expectedKeys = ['txHash', 'status', 'mined'];
    const approvedKeys = getApprovedKeys(
      {
        ...mileStone,
        reviewerAddress: SAMPLE_DATA.USER_ADDRESS,
        status: SAMPLE_DATA.MILESTONE_STATUSES.COMPLETED,
      },
      {
        status: SAMPLE_DATA.MILESTONE_STATUSES.PAYING,
      },
      mileStoneOwnerUser,
    );

    expect(approvedKeys.sort()).to.deep.equal(expectedKeys.sort());
  });

  it('should throw exception, Only the Milestone Manager or Campaign Manager can archive a milestone', function() {
    const badFunc = () => {
      getApprovedKeys(
        {
          ...mileStone,
          reviewerAddress: SAMPLE_DATA.USER_ADDRESS,
          campaignReviewerAddress: SAMPLE_DATA.USER_ADDRESS,
          status: SAMPLE_DATA.MILESTONE_STATUSES.COMPLETED,
        },
        {
          status: SAMPLE_DATA.MILESTONE_STATUSES.ARCHIVED,
        },
        {
          address: SAMPLE_DATA.SECOND_USER_ADDRESS,
        },
      );
    };

    assert.throw(badFunc, 'Only the Milestone Manager or Campaign Manager can archive a milestone');
  });

  it('should return an array, Milestone Manager or Recipient want to archive milestone', function() {
    const expectedKeys = ['txHash', 'status', 'mined'];
    const approvedKeys = getApprovedKeys(
      {
        ...mileStone,
        reviewerAddress: SAMPLE_DATA.USER_ADDRESS,
        status: SAMPLE_DATA.MILESTONE_STATUSES.COMPLETED,
      },
      {
        status: SAMPLE_DATA.MILESTONE_STATUSES.ARCHIVED,
      },
      mileStoneOwnerUser,
    );

    expect(approvedKeys.sort()).to.deep.equal(expectedKeys.sort());
  });

  it('should return an empty array, milestones with status Pending cant be updated', function() {
    for (const status of Object.values(SAMPLE_DATA.MILESTONE_STATUSES)) {
      const approvedKeys = getApprovedKeys(
        {
          ...mileStone,
          status: SAMPLE_DATA.MILESTONE_STATUSES.PENDING,
        },
        {
          status,
        },
        mileStoneOwnerUser,
      );
      assert.isArray(approvedKeys);
      assert.equal(approvedKeys.length, 0);
    }
  });

  it('should return an empty array, milestones with status Cancelled cant be updated', function() {
    for (const status of Object.values(SAMPLE_DATA.MILESTONE_STATUSES)) {
      const approvedKeys = getApprovedKeys(
        {
          ...mileStone,
          status: SAMPLE_DATA.MILESTONE_STATUSES.CANCELED,
        },
        {
          status,
        },
        mileStoneOwnerUser,
      );
      assert.isArray(approvedKeys);
      assert.equal(approvedKeys.length, 0);
    }
  });
}

describe('getApprovedKeys() tests', getApprovedKeysTestCases);
