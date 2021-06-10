const { assert, expect } = require('chai');
const getApprovedKeys = require('./getApprovedKeys');
const { SAMPLE_DATA } = require('../../../test/testUtility');

function getApprovedKeysTestCases() {
  const trace = {
    recipientAddress: SAMPLE_DATA.USER_ADDRESS,
    ownerAddress: SAMPLE_DATA.USER_ADDRESS,
    campaign: {
      ownerAddress: SAMPLE_DATA.USER_ADDRESS,
      coownerAddress: SAMPLE_DATA.USER_ADDRESS,
    },
  };
  const traceOwnerUser = {
    address: SAMPLE_DATA.USER_ADDRESS,
  };
  it('should return just pendingRecipientAddress if data included pendingRecipientAddress', () => {
    const approvedKeys = getApprovedKeys(
      trace,
      { pendingRecipientAddress: 'test' },
      traceOwnerUser,
    );

    assert.equal(approvedKeys.length, 1);
    assert.equal(approvedKeys[0], 'pendingRecipientAddress');
  });

  it('should throw exception because user is not trace recipient', () => {
    const badFunc = () => {
      getApprovedKeys(
        trace,
        { pendingRecipientAddress: 'test' },
        {
          address: SAMPLE_DATA.SECOND_USER_ADDRESS,
        },
      );
    };
    assert.throw(badFunc, 'Only the Trace recipient can change the recipient');
  });

  it('should throw exception because trace has no recipientAddress and user is not trace owner', () => {
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
    assert.throw(badFunc, 'Only the Trace Manager can set the recipient');
  });

  it('should throw exception because user is not trace recipient', () => {
    const badFunc = () => {
      getApprovedKeys(
        trace,
        { pendingRecipientAddress: 'test' },
        {
          address: SAMPLE_DATA.SECOND_USER_ADDRESS,
        },
      );
    };

    assert.throw(badFunc, 'Only the Trace recipient can change the recipient');
  });

  it('should throw exception, Only the Campaign Manager can accept a trace', () => {
    const badFunc = () => {
      getApprovedKeys(
        { ...trace, status: SAMPLE_DATA.TRACE_STATUSES.PROPOSED },
        { status: SAMPLE_DATA.TRACE_STATUSES.PENDING },
        {
          address: SAMPLE_DATA.SECOND_USER_ADDRESS,
        },
      );
    };

    assert.throw(badFunc, 'Only the Campaign Manager can accept a trace');
  });

  it('should return an array, campaignManager wants to accept trace', () => {
    const expectedKeys = ['txHash', 'status', 'mined', 'ownerAddress', 'message', 'proofItems'];
    const approvedKeys = getApprovedKeys(
      { ...trace, status: SAMPLE_DATA.TRACE_STATUSES.PROPOSED },
      { status: SAMPLE_DATA.TRACE_STATUSES.PENDING },
      traceOwnerUser,
    );

    expect(approvedKeys.sort()).to.deep.equal(expectedKeys.sort());
  });

  it('should throw exception, Only the Campaign Manager can reject a trace', () => {
    const badFunc = () => {
      getApprovedKeys(
        { ...trace, status: SAMPLE_DATA.TRACE_STATUSES.PROPOSED },
        { status: SAMPLE_DATA.TRACE_STATUSES.REJECTED },
        {
          address: SAMPLE_DATA.SECOND_USER_ADDRESS,
        },
      );
    };

    assert.throw(badFunc, 'Only the Campaign Manager can reject a trace');
  });

  it('should return an array, campaignManager wants to reject trace', () => {
    const expectedKeys = ['status', 'message', 'proofItems'];
    const approvedKeys = getApprovedKeys(
      { ...trace, status: SAMPLE_DATA.TRACE_STATUSES.PROPOSED },
      { status: SAMPLE_DATA.TRACE_STATUSES.REJECTED },
      traceOwnerUser,
    );

    expect(approvedKeys.sort()).to.deep.equal(expectedKeys.sort());
  });

  it('should throw exception, Only the Trace Manager or Recipient can mark a trace complete', () => {
    const badFunc = () => {
      getApprovedKeys(
        { ...trace, status: SAMPLE_DATA.TRACE_STATUSES.IN_PROGRESS },
        { status: SAMPLE_DATA.TRACE_STATUSES.NEEDS_REVIEW },
        {
          address: SAMPLE_DATA.SECOND_USER_ADDRESS,
        },
      );
    };

    assert.throw(badFunc, 'Only the Trace Manager or Recipient can mark a trace complete');
  });

  it('should return an array, trace manager wants to mark a trace complete', () => {
    const expectedKeys = ['description', 'txHash', 'status', 'mined', 'message', 'proofItems'];
    const approvedKeys = getApprovedKeys(
      { ...trace, status: SAMPLE_DATA.TRACE_STATUSES.IN_PROGRESS },
      { status: SAMPLE_DATA.TRACE_STATUSES.NEEDS_REVIEW },
      traceOwnerUser,
    );

    expect(approvedKeys.sort()).to.deep.equal(expectedKeys.sort());
  });

  it('should throw exception, Only the Trace Manager or Campaign Manager can archive a trace', () => {
    const badFunc = () => {
      getApprovedKeys(
        { ...trace, status: SAMPLE_DATA.TRACE_STATUSES.IN_PROGRESS },
        { status: SAMPLE_DATA.TRACE_STATUSES.ARCHIVED },
        {
          address: SAMPLE_DATA.SECOND_USER_ADDRESS,
        },
      );
    };

    assert.throw(badFunc, 'Only the Trace Manager or Campaign Manager can archive a trace');
  });

  it('should return an array, trace manager wants to archive a trace', () => {
    const expectedKeys = ['txHash', 'status', 'mined'];
    const approvedKeys = getApprovedKeys(
      { ...trace, status: SAMPLE_DATA.TRACE_STATUSES.IN_PROGRESS },
      { status: SAMPLE_DATA.TRACE_STATUSES.ARCHIVED },
      traceOwnerUser,
    );

    expect(approvedKeys.sort()).to.deep.equal(expectedKeys.sort());
  });

  it('should throw exception, Only the Trace Manager or Trace Reviewer can cancel a trace', () => {
    const badFunc = () => {
      getApprovedKeys(
        { ...trace, status: SAMPLE_DATA.TRACE_STATUSES.IN_PROGRESS },
        {
          status: SAMPLE_DATA.TRACE_STATUSES.CANCELED,
          mined: false,
        },
        {
          address: SAMPLE_DATA.SECOND_USER_ADDRESS,
        },
      );
    };

    assert.throw(badFunc, 'Only the Trace Manager or Trace Reviewer can cancel a trace');
  });

  it('should return an array, trace manager wants to cancel a trace', () => {
    const expectedKeys = ['txHash', 'status', 'mined', 'prevStatus', 'message', 'proofItems'];
    const approvedKeys = getApprovedKeys(
      { ...trace, status: SAMPLE_DATA.TRACE_STATUSES.IN_PROGRESS },
      {
        status: SAMPLE_DATA.TRACE_STATUSES.CANCELED,
        mined: false,
      },
      traceOwnerUser,
    );

    expect(approvedKeys.sort()).to.deep.equal(expectedKeys.sort());
  });

  it('should throw exception, Only the Trace and Campaign Manager can edit mileston', () => {
    const badFunc = () => {
      getApprovedKeys(
        { ...trace, status: SAMPLE_DATA.TRACE_STATUSES.IN_PROGRESS },
        {
          status: SAMPLE_DATA.TRACE_STATUSES.IN_PROGRESS,
        },
        {
          address: SAMPLE_DATA.SECOND_USER_ADDRESS,
        },
      );
    };

    assert.throw(badFunc, 'Only the Trace and Campaign Manager can edit trace');
  });

  it('should return an array, trace manager wants to edit a trace', () => {
    const expectedKeys = ['title', 'description', 'image', 'message', 'proofItems', 'mined'];
    const approvedKeys = getApprovedKeys(
      { ...trace, status: SAMPLE_DATA.TRACE_STATUSES.IN_PROGRESS },
      {
        status: SAMPLE_DATA.TRACE_STATUSES.IN_PROGRESS,
        mined: false,
      },
      traceOwnerUser,
    );

    expect(approvedKeys.sort()).to.deep.equal(expectedKeys.sort());
  });

  it('should throw exception, Only the Trace and Campaign Manager can edit proposed trace', () => {
    const badFunc = () => {
      getApprovedKeys(
        { ...trace, status: SAMPLE_DATA.TRACE_STATUSES.IN_PROGRESS },
        {
          status: SAMPLE_DATA.TRACE_STATUSES.PROPOSED,
        },
        {
          address: SAMPLE_DATA.SECOND_USER_ADDRESS,
        },
      );
    };

    assert.throw(badFunc, 'Only the Trace and Campaign Manager can edit proposed trace');
  });

  it('should return an array, trace manager wants to edit a proposed trace', () => {
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
      'communityId',
    ];
    const approvedKeys = getApprovedKeys(
      { ...trace, status: SAMPLE_DATA.TRACE_STATUSES.IN_PROGRESS },
      {
        status: SAMPLE_DATA.TRACE_STATUSES.PROPOSED,
        mined: false,
      },
      traceOwnerUser,
    );

    expect(approvedKeys.sort()).to.deep.equal(expectedKeys.sort());
  });

  it('should return an empty array, data.status doesnt match to any if statement in InProgress case', () => {
    const statusShouldReturnEmptyArrray = [
      SAMPLE_DATA.TRACE_STATUSES.COMPLETED,
      SAMPLE_DATA.TRACE_STATUSES.PENDING,
      SAMPLE_DATA.TRACE_STATUSES.PAYING,
      SAMPLE_DATA.TRACE_STATUSES.PAID,
      SAMPLE_DATA.TRACE_STATUSES.FAILED,
      SAMPLE_DATA.TRACE_STATUSES.REJECTED,
    ];
    /* eslint-disable no-restricted-syntax  */
    for (const status of statusShouldReturnEmptyArrray) {
      const approvedKeys = getApprovedKeys(
        { ...trace, status: SAMPLE_DATA.TRACE_STATUSES.IN_PROGRESS },
        {
          status,
          mined: false,
        },
        traceOwnerUser,
      );
      assert.isArray(approvedKeys);
      assert.equal(approvedKeys.length, 0);
    }
  });

  it('should throw exception, Only the Trace or Campaign Reviewer can approve trace has been completed', () => {
    const badFunc = () => {
      getApprovedKeys(
        {
          ...trace,
          reviewerAddress: SAMPLE_DATA.USER_ADDRESS,
          campaignReviewerAddress: SAMPLE_DATA.USER_ADDRESS,
          status: SAMPLE_DATA.TRACE_STATUSES.NEEDS_REVIEW,
        },
        {
          status: SAMPLE_DATA.TRACE_STATUSES.COMPLETED,
          mined: false,
        },
        {
          address: SAMPLE_DATA.SECOND_USER_ADDRESS,
        },
      );
    };

    assert.throw(
      badFunc,
      'Only the Trace or Campaign Reviewer can approve trace has been completed',
    );
  });

  it('should return an array, Campaign Reviewer wants to approve trace has been completed', () => {
    const expectedKeys = ['txHash', 'status', 'mined', 'prevStatus', 'message', 'proofItems'];
    const approvedKeys = getApprovedKeys(
      {
        ...trace,
        reviewerAddress: SAMPLE_DATA.USER_ADDRESS,
        status: SAMPLE_DATA.TRACE_STATUSES.NEEDS_REVIEW,
      },
      {
        status: SAMPLE_DATA.TRACE_STATUSES.COMPLETED,
        mined: false,
      },
      traceOwnerUser,
    );

    expect(approvedKeys.sort()).to.deep.equal(expectedKeys.sort());
  });

  it('should throw exception, Only the Trace or Campaign Reviewer can reject that trace has been completed', () => {
    const badFunc = () => {
      getApprovedKeys(
        {
          ...trace,
          reviewerAddress: SAMPLE_DATA.USER_ADDRESS,
          campaignReviewerAddress: SAMPLE_DATA.USER_ADDRESS,
          status: SAMPLE_DATA.TRACE_STATUSES.NEEDS_REVIEW,
        },
        {
          status: SAMPLE_DATA.TRACE_STATUSES.IN_PROGRESS,
        },
        {
          address: SAMPLE_DATA.SECOND_USER_ADDRESS,
        },
      );
    };

    assert.throw(
      badFunc,
      'Only the Trace or Campaign Reviewer can reject that trace has been completed',
    );
  });

  it('should return an array,Trace or Campaign Reviewer want to reject that trace has been completed', () => {
    const expectedKeys = ['status', 'mined', 'message', 'proofItems'];
    const approvedKeys = getApprovedKeys(
      {
        ...trace,
        reviewerAddress: SAMPLE_DATA.USER_ADDRESS,
        status: SAMPLE_DATA.TRACE_STATUSES.NEEDS_REVIEW,
      },
      {
        status: SAMPLE_DATA.TRACE_STATUSES.IN_PROGRESS,
      },
      traceOwnerUser,
    );
    expect(approvedKeys.sort()).to.deep.equal(expectedKeys.sort());
  });

  it("should throw exception, Only the Trace Manager or Trace Reviewer can cancel a trace'", () => {
    const badFunc = () => {
      getApprovedKeys(
        {
          ...trace,
          reviewerAddress: SAMPLE_DATA.USER_ADDRESS,
          campaignReviewerAddress: SAMPLE_DATA.USER_ADDRESS,
          status: SAMPLE_DATA.TRACE_STATUSES.NEEDS_REVIEW,
        },
        {
          status: SAMPLE_DATA.TRACE_STATUSES.CANCELED,
          mined: false,
        },
        {
          address: SAMPLE_DATA.SECOND_USER_ADDRESS,
        },
      );
    };

    assert.throw(badFunc, 'Only the Trace Manager or Trace Reviewer can cancel a trace');
  });

  it('should return an array, Trace Manager or Trace Reviewer want to cancel a trace', () => {
    const expectedKeys = ['txHash', 'status', 'mined', 'prevStatus', 'message', 'proofItems'];
    const approvedKeys = getApprovedKeys(
      {
        ...trace,
        reviewerAddress: SAMPLE_DATA.USER_ADDRESS,
        status: SAMPLE_DATA.TRACE_STATUSES.NEEDS_REVIEW,
      },
      {
        status: SAMPLE_DATA.TRACE_STATUSES.CANCELED,
        mined: false,
      },
      traceOwnerUser,
    );

    expect(approvedKeys.sort()).to.deep.equal(expectedKeys.sort());
  });

  it('should throw exception, Only the Trace and Campaign Manager can edit trace', () => {
    const badFunc = () => {
      getApprovedKeys(
        {
          ...trace,
          reviewerAddress: SAMPLE_DATA.USER_ADDRESS,
          campaignReviewerAddress: SAMPLE_DATA.USER_ADDRESS,
          status: SAMPLE_DATA.TRACE_STATUSES.NEEDS_REVIEW,
        },
        {
          status: SAMPLE_DATA.TRACE_STATUSES.NEEDS_REVIEW,
        },
        {
          address: SAMPLE_DATA.SECOND_USER_ADDRESS,
        },
      );
    };

    assert.throw(badFunc, 'Only the Trace and Campaign Manager can edit trace');
  });

  it('should return an array, Trace Manager or Campaign Manager want to edit a trace', () => {
    const expectedKeys = ['title', 'description', 'image', 'message', 'proofItems', 'mined'];
    const approvedKeys = getApprovedKeys(
      {
        ...trace,
        reviewerAddress: SAMPLE_DATA.USER_ADDRESS,
        status: SAMPLE_DATA.TRACE_STATUSES.NEEDS_REVIEW,
      },
      {
        status: SAMPLE_DATA.TRACE_STATUSES.NEEDS_REVIEW,
        mined: false,
      },
      traceOwnerUser,
    );

    expect(approvedKeys.sort()).to.deep.equal(expectedKeys.sort());
  });

  it('should return an empty array, data.status doesnt match to any if statement in NeedsReview case', () => {
    const statusShouldReturnEmptyArrray = [
      SAMPLE_DATA.TRACE_STATUSES.PENDING,
      SAMPLE_DATA.TRACE_STATUSES.PAYING,
      SAMPLE_DATA.TRACE_STATUSES.PAID,
      SAMPLE_DATA.TRACE_STATUSES.FAILED,
      SAMPLE_DATA.TRACE_STATUSES.REJECTED,
      SAMPLE_DATA.TRACE_STATUSES.PROPOSED,
      SAMPLE_DATA.TRACE_STATUSES.ARCHIVED,
    ];

    for (const status of statusShouldReturnEmptyArrray) {
      const approvedKeys = getApprovedKeys(
        {
          ...trace,
          reviewerAddress: SAMPLE_DATA.USER_ADDRESS,
          status: SAMPLE_DATA.TRACE_STATUSES.NEEDS_REVIEW,
        },
        {
          status,
          mined: false,
        },
        traceOwnerUser,
      );
      assert.isArray(approvedKeys);
      assert.equal(approvedKeys.length, 0);
    }
  });

  it('should throw exception, Only the Trace Manager or Recipient can disburse a trace payment', () => {
    const badFunc = () => {
      getApprovedKeys(
        {
          ...trace,
          reviewerAddress: SAMPLE_DATA.USER_ADDRESS,
          campaignReviewerAddress: SAMPLE_DATA.USER_ADDRESS,
          status: SAMPLE_DATA.TRACE_STATUSES.COMPLETED,
        },
        {
          status: SAMPLE_DATA.TRACE_STATUSES.PAYING,
        },
        {
          address: SAMPLE_DATA.SECOND_USER_ADDRESS,
        },
      );
    };

    assert.throw(badFunc, 'Only the Trace Manager or Recipient can disburse a trace payment');
  });

  it('should return an array, Trace Manager or Recipient can disburse a trace payment', () => {
    const expectedKeys = ['txHash', 'status', 'mined'];
    const approvedKeys = getApprovedKeys(
      {
        ...trace,
        reviewerAddress: SAMPLE_DATA.USER_ADDRESS,
        status: SAMPLE_DATA.TRACE_STATUSES.COMPLETED,
      },
      {
        status: SAMPLE_DATA.TRACE_STATUSES.PAYING,
      },
      traceOwnerUser,
    );

    expect(approvedKeys.sort()).to.deep.equal(expectedKeys.sort());
  });

  it('should throw exception, Only the Trace Manager or Campaign Manager can archive a trace', () => {
    const badFunc = () => {
      getApprovedKeys(
        {
          ...trace,
          reviewerAddress: SAMPLE_DATA.USER_ADDRESS,
          campaignReviewerAddress: SAMPLE_DATA.USER_ADDRESS,
          status: SAMPLE_DATA.TRACE_STATUSES.COMPLETED,
        },
        {
          status: SAMPLE_DATA.TRACE_STATUSES.ARCHIVED,
        },
        {
          address: SAMPLE_DATA.SECOND_USER_ADDRESS,
        },
      );
    };

    assert.throw(badFunc, 'Only the Trace Manager or Campaign Manager can archive a trace');
  });

  it('should return an array, Trace Manager or Recipient want to archive trace', () => {
    const expectedKeys = ['txHash', 'status', 'mined'];
    const approvedKeys = getApprovedKeys(
      {
        ...trace,
        reviewerAddress: SAMPLE_DATA.USER_ADDRESS,
        status: SAMPLE_DATA.TRACE_STATUSES.COMPLETED,
      },
      {
        status: SAMPLE_DATA.TRACE_STATUSES.ARCHIVED,
      },
      traceOwnerUser,
    );

    expect(approvedKeys.sort()).to.deep.equal(expectedKeys.sort());
  });

  it('should return an empty array, traces with status Pending cant be updated', () => {
    for (const status of Object.values(SAMPLE_DATA.TRACE_STATUSES)) {
      const approvedKeys = getApprovedKeys(
        {
          ...trace,
          status: SAMPLE_DATA.TRACE_STATUSES.PENDING,
        },
        {
          status,
        },
        traceOwnerUser,
      );
      assert.isArray(approvedKeys);
      assert.equal(approvedKeys.length, 0);
    }
  });

  it('should return an empty array, traces with status Cancelled cant be updated', () => {
    for (const status of Object.values(SAMPLE_DATA.TRACE_STATUSES)) {
      const approvedKeys = getApprovedKeys(
        {
          ...trace,
          status: SAMPLE_DATA.TRACE_STATUSES.CANCELED,
        },
        {
          status,
        },
        traceOwnerUser,
      );
      assert.isArray(approvedKeys);
      assert.equal(approvedKeys.length, 0);
    }
  });
}

describe('getApprovedKeys() tests', getApprovedKeysTestCases);
